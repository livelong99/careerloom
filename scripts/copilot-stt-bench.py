#!/usr/bin/env python3
"""Interview Copilot spike S2: local STT bake-off (Moonshine streaming vs Whisper on MLX).

Standalone. Run inside a venv OUTSIDE the repo:
  uv venv --python 3.12 $TMPDIR/s2/venv && . $TMPDIR/s2/venv/bin/activate
  uv pip install moonshine-voice==0.1.5 mlx-whisper==0.4.3 jiwer numpy psutil

  copilot-stt-bench.py fixtures --out DIR           # synthetic clips via macOS `say` + ffmpeg
  copilot-stt-bench.py run --fixtures DIR --engine moonshine --model small --provider cpu
  copilot-stt-bench.py run --fixtures DIR --engine whisper-mlx --model mlx-community/whisper-small-mlx
  copilot-stt-bench.py all --fixtures DIR --out results.jsonl   # every config, one process at a time

Audio is fed in real time (wall-clock paced) so latency = wall time from true end of speech to the
final event. ONE model process at a time; `all` refuses to start unless memory_pressure is healthy.
Fixtures are synthetic (TTS), so WER only ranks engines roughly; it does not predict real speech.
"""
import argparse, json, os, re, subprocess, sys, threading, time, wave
from pathlib import Path

import numpy as np

SR = 16000
CHUNK_S = 0.1          # 100 ms frames, like the planned capture worklet
GAP_S = 1.6            # silence after every utterance (final-after-silence needs a real gap)
END_SILENCE_MS = 700   # whisper chunker endpointing (plan: endSilenceMs)

# Interview-flavoured sentences with jargon ASR tends to break on; no numerals/symbols so WER is not
# polluted by text-normalisation differences ("60%" vs "sixty percent").
SENTENCES = [
    "Tell me about a time you designed a distributed system that had to scale.",
    "I led the migration from a monolith to Kubernetes and cut deployment time in half.",
    "How would you debug a memory leak in a Node service running on AWS Lambda?",
    "We used Kafka for event streaming and PostgreSQL with read replicas for reporting.",
    "What is the difference between a mutex and a semaphore, and when would you use each?",
    "My biggest strength is breaking ambiguous problems into small testable pieces.",
    "Walk me through how you would design a rate limiter for a public REST API.",
    "I reduced the tail latency of our checkout service by more than half.",
]

# (set name, voices per utterance rotation, noise snr dB or None)
SETS = {
    "clean":   (["Samantha"], None),
    "noisy":   (["Samantha"], 12),
    "accent":  (["Rishi", "Aman"], None),
    "dialog":  (["Daniel", "Rishi"], None),   # interviewer (Daniel) / candidate (Rishi) alternate
}


def norm(t: str) -> str:
    t = t.lower().replace("-", " ")
    t = re.sub(r"[^a-z0-9' ]+", " ", t)
    return re.sub(r"\s+", " ", t).strip()


def wer(ref: str, hyp: str) -> float:
    import jiwer
    return float(jiwer.wer(norm(ref), norm(hyp) or "<empty>"))


def read_wav(p) -> np.ndarray:
    with wave.open(str(p)) as w:
        assert w.getframerate() == SR and w.getnchannels() == 1
        return np.frombuffer(w.readframes(w.getnframes()), np.int16).astype(np.float32) / 32768


def write_wav(p, x: np.ndarray):
    with wave.open(str(p), "wb") as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR)
        w.writeframes((np.clip(x, -1, 1) * 32767).astype(np.int16).tobytes())


def tts(voice: str, text: str, tmp: Path) -> np.ndarray:
    aiff = tmp / "u.aiff"; wav = tmp / "u.wav"
    subprocess.run(["say", "-v", voice, "-o", str(aiff), text], check=True)
    subprocess.run(["ffmpeg", "-y", "-loglevel", "error", "-i", str(aiff), "-ac", "1", "-ar", str(SR), str(wav)], check=True)
    x = read_wav(wav)
    act = np.where(np.abs(x) > 0.01)[0]          # trim TTS lead/tail silence so speech end is exact
    return x[act[0]:act[-1] + 1]


def add_noise(x: np.ndarray, snr_db: float, rng) -> np.ndarray:
    # pink-ish office noise: white noise low-passed by a moving average, scaled to the target SNR over the whole clip
    n = np.convolve(rng.standard_normal(len(x)), np.ones(8) / 8, "same")
    p_sig = np.mean(x[np.abs(x) > 0.01] ** 2)
    n *= np.sqrt(p_sig / 10 ** (snr_db / 10) / np.mean(n ** 2))
    return x + n


def cmd_fixtures(a):
    out = Path(a.out); out.mkdir(parents=True, exist_ok=True)
    rng = np.random.default_rng(7)
    tmp = out / ".tmp"; tmp.mkdir(exist_ok=True)
    for name, (voices, snr) in SETS.items():
        parts, utts, t = [np.zeros(int(0.5 * SR), np.float32)], [], 0.5
        for i, s in enumerate(SENTENCES):
            v = voices[i % len(voices)]
            x = tts(v, s, tmp)
            utts.append({"text": s, "voice": v, "start": t, "end": t + len(x) / SR})
            parts += [x, np.zeros(int(GAP_S * SR), np.float32)]
            t += len(x) / SR + GAP_S
        audio = np.concatenate(parts)
        if snr:
            audio = add_noise(audio, snr, rng)
        write_wav(out / f"{name}.wav", audio * 0.9)
        (out / f"{name}.json").write_text(json.dumps({"set": name, "snr_db": snr, "utterances": utts}, indent=1))
        print(f"{name}: {len(audio) / SR:.1f}s, {len(utts)} utterances")
    for f in tmp.iterdir(): f.unlink()
    tmp.rmdir()


# ---------- engines: each takes float32 chunks and returns finals as (emit_time_s, text) ----------

class Moonshine:
    def __init__(self, size, provider, update_interval):
        from moonshine_voice import Transcriber, ModelArch, get_model_for_language
        from moonshine_voice.transcriber import TranscriptEventListener
        arch = {"tiny": ModelArch.TINY_STREAMING, "small": ModelArch.SMALL_STREAMING, "medium": ModelArch.MEDIUM_STREAMING}[size]
        path, arch = get_model_for_language("en", arch)
        opts = {} if provider == "cpu" else {"ort_providers": provider}
        self.tr = Transcriber(path, arch, update_interval=update_interval, options=opts)
        self.stream = self.tr.create_stream(update_interval=update_interval)
        self.finals, self.t0, self.engine_ms = [], 0.0, []
        eng = self

        class L(TranscriptEventListener):
            def on_line_completed(self, e):
                eng.finals.append((time.perf_counter() - eng.t0, e.line.text))
                eng.engine_ms.append(getattr(e.line, "last_transcription_latency_ms", 0))
        self.stream.add_listener(L())
        self.stream.start()

    def feed(self, x):
        self.stream.add_audio(x.tolist(), SR)

    def flush(self):
        self.stream.stop()                 # completes any open line
        self.stream.start()

    def close(self):
        self.stream.stop()
        self.tr.close()


class WhisperMLX:
    """Chunker per plan s.3.2: RMS VAD gate, growing-window partial re-decode ~1 s, final on silence >= END_SILENCE_MS."""
    def __init__(self, repo):
        import mlx_whisper
        self.mw, self.repo = mlx_whisper, repo
        self.decode("warm", np.zeros(SR, np.float32))   # load weights outside the timed loop
        self.buf, self.speech, self.quiet, self.last_partial = [], False, 0.0, 0.0
        self.rms_hist, self.finals, self.t0, self.clock = [], [], 0.0, 0.0
        self.engine_ms = []

    def decode(self, _tag, x):
        r = self.mw.transcribe(x, path_or_hf_repo=self.repo, language="en", fp16=True, condition_on_previous_text=False, verbose=None)
        return r["text"].strip()

    def feed(self, x):
        self.clock += len(x) / SR
        rms = float(np.sqrt(np.mean(x ** 2)))
        self.rms_hist = (self.rms_hist + [rms])[-40:]                 # trailing 4 s
        floor = float(np.percentile(self.rms_hist, 10))               # noise floor = quiet tail of recent frames
        voiced = rms > max(floor * 2.5, 0.004)
        if voiced or self.speech:
            self.buf.append(x)
        if voiced:
            self.speech, self.quiet = True, 0.0
        elif self.speech:
            self.quiet += len(x) / SR
            if self.quiet * 1000 >= END_SILENCE_MS:
                t = time.perf_counter()
                text = self.decode("final", np.concatenate(self.buf))
                self.engine_ms.append((time.perf_counter() - t) * 1000)
                self.finals.append((time.perf_counter() - self.t0, text))
                self.buf, self.speech, self.quiet, self.last_partial = [], False, 0.0, 0.0
                return
        behind = time.perf_counter() - self.t0 - self.clock > 0.3    # never let partials delay a final: skip when lagging
        if self.speech and not behind and sum(len(b) for b in self.buf) / SR - self.last_partial >= 1.0:   # growing-window partial (cost only; text unused)
            self.last_partial = sum(len(b) for b in self.buf) / SR
            self.decode("partial", np.concatenate(self.buf))

    def flush(self):
        if self.buf:
            self.finals.append((time.perf_counter() - self.t0, self.decode("final", np.concatenate(self.buf))))
            self.buf, self.speech, self.quiet = [], False, 0.0

    def close(self):
        pass


def pct(v, p):
    return float(np.percentile(v, p)) if len(v) else float("nan")


def cmd_run(a):
    import psutil
    proc = psutil.Process()
    rss0 = proc.memory_info().rss
    t_load = time.perf_counter()
    eng = Moonshine(a.model, a.provider, a.update_interval) if a.engine == "moonshine" else WhisperMLX(a.model)
    load_s = time.perf_counter() - t_load
    peak = [proc.memory_info().rss]; stop = threading.Event()

    def sample():
        while not stop.is_set():
            peak[0] = max(peak[0], proc.memory_info().rss); time.sleep(0.05)
    threading.Thread(target=sample, daemon=True).start()

    res = {"engine": a.engine, "model": a.model, "provider": a.provider, "update_interval": a.update_interval,
           "load_s": round(load_s, 2), "sets": {}}
    lat_all, cpu0, wall0, audio_total, proc_wall = [], proc.cpu_times(), time.perf_counter(), 0.0, 0.0
    for name in a.sets:
        audio = read_wav(Path(a.fixtures) / f"{name}.wav")
        meta = json.loads((Path(a.fixtures) / f"{name}.json").read_text())["utterances"]
        eng.finals.clear(); getattr(eng, "engine_ms", []).clear()
        n = int(CHUNK_S * SR)
        t0 = eng.t0 = time.perf_counter()
        busy = 0.0
        for i in range(0, len(audio), n):
            due = t0 + (i + n) / SR                     # chunk "arrives" when its last sample has been spoken
            if (d := due - time.perf_counter()) > 0: time.sleep(d)
            b = time.perf_counter(); eng.feed(audio[i:i + n]); busy += time.perf_counter() - b
        eng.flush()
        finals = list(eng.finals)
        lats, missed = [], 0
        for k, u in enumerate(meta):
            nxt = meta[k + 1]["start"] if k + 1 < len(meta) else 1e9
            hit = [t for t, _ in finals if u["end"] < t < nxt]
            if hit: lats.append(hit[0] - u["end"])
            else: missed += 1
        ref = " ".join(u["text"] for u in meta); hyp = " ".join(t for _, t in finals)
        res["sets"][name] = {"wer": round(wer(ref, hyp), 4), "lat_p50": round(pct(lats, 50), 3), "lat_p95": round(pct(lats, 95), 3),
                             "missed_finals": missed, "engine_ms_p50": round(pct(getattr(eng, "engine_ms", []), 50), 1),
                             "hyp": hyp}
        lat_all += lats; audio_total += len(audio) / SR; proc_wall += busy
    eng.close()
    cpu1 = proc.cpu_times(); wall = time.perf_counter() - wall0
    stop.set()
    res.update(lat_p50=round(pct(lat_all, 50), 3), lat_p95=round(pct(lat_all, 95), 3),
               rtf=round(proc_wall / audio_total, 4),                        # compute seconds per audio second
               cpu_pct=round(100 * ((cpu1.user + cpu1.system) - (cpu0.user + cpu0.system)) / wall, 1),   # of one core, real-time paced
               peak_rss_mb=round(peak[0] / 1e6), rss_delta_mb=round((peak[0] - rss0) / 1e6),
               wer=round(float(np.mean([s["wer"] for s in res["sets"].values()])), 4))
    print(json.dumps(res))


def pressure_ok() -> bool:
    out = subprocess.run(["memory_pressure"], capture_output=True, text=True).stdout
    m = re.search(r"free percentage: (\d+)%", out)
    return bool(m) and int(m.group(1)) >= 20


CONFIGS = [  # (engine, model, provider)
    ("moonshine", "tiny", "cpu"), ("moonshine", "small", "cpu"), ("moonshine", "medium", "cpu"),
    ("moonshine", "small", "coreml"),   # 0.1.5 macOS wheel: "CoreML execution provider is not in this build" -> recorded as an error row
    ("whisper-mlx", "mlx-community/whisper-small-mlx", "gpu"),
    ("whisper-mlx", "mlx-community/whisper-large-v3-turbo", "gpu"),
]


def cmd_all(a):
    with open(a.out, "a") as f:
        for eng, model, prov in CONFIGS:
            if not pressure_ok():
                sys.exit("memory pressure not healthy (free < 20%): stopping; close other heavy apps and rerun")
            cmd = [sys.executable, __file__, "run", "--fixtures", a.fixtures, "--engine", eng, "--model", model, "--provider", prov]
            r = subprocess.run(cmd, capture_output=True, text=True)
            line = r.stdout.strip().splitlines()[-1] if r.returncode == 0 and r.stdout.strip() else json.dumps(
                {"engine": eng, "model": model, "provider": prov, "error": (r.stderr.strip().splitlines() or ["?"])[-1]})
            f.write(line + "\n"); f.flush(); print(line[:300])


def _selfcheck():
    assert norm("Node.js, p-99!") == "node js p 99"
    assert wer("a b c", "a b c") == 0.0 and abs(wer("a b c d", "a b x d") - 0.25) < 1e-9


if __name__ == "__main__":
    p = argparse.ArgumentParser(); sp = p.add_subparsers(dest="cmd", required=True)
    f = sp.add_parser("fixtures"); f.add_argument("--out", required=True)
    r = sp.add_parser("run"); r.add_argument("--fixtures", required=True)
    r.add_argument("--engine", choices=["moonshine", "whisper-mlx"], required=True)
    r.add_argument("--model", required=True); r.add_argument("--provider", default="cpu")
    r.add_argument("--update-interval", type=float, default=0.5); r.add_argument("--sets", nargs="+", default=list(SETS))
    al = sp.add_parser("all"); al.add_argument("--fixtures", required=True); al.add_argument("--out", required=True)
    sp.add_parser("selfcheck")
    a = p.parse_args()
    {"fixtures": cmd_fixtures, "run": cmd_run, "all": cmd_all, "selfcheck": lambda _: _selfcheck()}[a.cmd](a)
