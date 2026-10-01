# S2 — STT bake-off (Moonshine Voice vs Whisper on MLX)

Date 2026-10-01 · Apple Silicon Mac, 16 GB, macOS (Darwin 27) · local only, $0 · harness: `scripts/copilot-stt-bench.py` (venv under `$TMPDIR`, nothing added to package.json).

## Method and limits (read first)
- **Fixtures are synthetic**: macOS `say` voices, 4 sets × 8 interview sentences (~48 s each, 1.6 s silence after each): `clean` (Samantha), `noisy` (same + coloured noise at 12 dB SNR), `accent` (Indian-English voices Rishi/Aman), `dialog` (Daniel = interviewer, Rishi = candidate). No real recordings, none of the user's. **TTS is cleaner and more regular than people, so absolute WER is optimistic and close WER gaps (≈1–3 points) are not conclusive**; the test sets 224 words each of only 8 sentences.
- **Latency = wall time from the true end of speech to the final event**, audio fed in real time in 100 ms frames (like the capture worklet). It includes endpointing silence, not just decode. Finals that arrive after the next utterance starts (>1.6 s) count as `missed` and are excluded from p50/p95, so those rows are lower bounds.
- Whisper has no streaming: harness chunker = RMS VAD (adaptive noise floor), final on `endSilenceMs=700`, 1 s growing-window partials (skipped when >0.3 s behind real time so they never delay a final). Moonshine uses its own VAD/endpointing (not tunable here). **Endpoint silence is a config knob, so Whisper's 0.7 s is not a property of the model**; decode cost is the `engine ms` column.
- RAM = process RSS peak. **MLX (Metal) weights live in unified GPU memory and are under-reported by RSS** (MLX rows show 286/193 MB for a 481 MB/1.6 GB model), so treat MLX RAM as ≥ model size on disk. CPU = process CPU time / wall time, of one core; MLX GPU load is not included. **No call app ran alongside** (not measured).
- Memory pressure checked before each run (free ≥ 34 %); one model process at a time.
- A first Whisper run was discarded: the chunker's noise floor never re-armed in noise and turbo fell behind from partial decodes. Fixed in the script; numbers below are from the fixed run.

## Results (mean over 4 sets; latency over 32 utterances)
| Engine / model | Compute | Disk | p50 / p95 final-after-silence | engine ms p50 | RTF | CPU % | Peak RSS | WER mean (clean / noisy / accent / dialog) |
|---|---|---|---|---|---|---|---|---|
| Moonshine tiny streaming | CPU | 45 MB | 0.70 / 1.07 s | 44–97 | 0.19 | 58 | 516 MB | **10.7 %** (7.1 / 12.5 / 15.2 / 8.0) |
| Moonshine small streaming | CPU | 139 MB | 0.93 / 1.39 s | 128–278 | 0.34 | 117 | 882 MB | 8.9 % (8.0 / 10.7 / 10.7 / 6.3) |
| Moonshine small, update_interval 0.1 | CPU | 139 MB | 0.79 / 1.01 s | — | 0.31 | 105 | 1047 MB | 9.4 % |
| Moonshine tiny, update_interval 0.1 | CPU | 45 MB | 0.80 / 1.02 s | — | 0.19 | 57 | 681 MB | 11.2 % |
| Moonshine medium streaming | CPU | 269 MB | 1.00 / 1.53 s (1–2 missed per set) | 275–481 | 0.58 | 169 | 1033 MB | 5.1 % (0.9 / 8.0 / 8.0 / 3.6) |
| Moonshine (any) | **CoreML** | — | **not available**: `ort_providers` CoreML → "CoreML execution provider is not in this build" (pip wheel 0.1.5, macOS arm64; `MoonshineUnknownError`) | | | | | |
| **Whisper small (MLX, fp16, multilingual)** | Metal GPU | 481 MB | **0.76 / 1.05 s** (1 missed) | 281–315 | 0.25 | 12 | ≥ 286 MB | **6.9 %** (4.5 / 8.0 / 8.9 / 6.3) |
| Whisper large-v3-turbo (MLX) | Metal GPU | 1.6 GB | 1.48 / 2.31 s (**≈5 of 8 finals missed per set**) | 920–1050 | 0.81 | 10 | ≥ 193 MB | **2.0 %** (0.0 / 1.8 / 2.7 / 3.6) |

Moonshine's own timing: model decode is 44–480 ms; the remaining ~0.55 s of its final latency is VAD endpointing. Vendor claims (34/73/107 ms) are for decode only and roughly match our `engine ms` for tiny/small on short clips; they are not end-of-speech-to-final latency.
Typical errors: Moonshine tiny/small mishear jargon ("monolith"→"Imanolith", "mutex"→"new Texan", "rate limiter"→"RAID limiter"); Whisper small and turbo get these right.

## Decision (plan §3.2 rule: lowest p50 with WER within 1.5 points of the best; G-C: p50 ≤ 0.8 s)
- Only Moonshine tiny (0.70 s), Whisper small (0.76 s) and Moonshine small at 0.1 s (0.79 s) meet G-C. Whisper small has the best WER of those by ≥ 2.5 points, and is the only one whose accuracy is acceptable for jargon-heavy questions.
- **Default: Whisper small on MLX** (Apple Silicon). **Fallback: Moonshine small streaming, `update_interval=0.1`, CPU** (139 MB, MIT, native streaming partials, no GPU, also the path for Intel Macs / a later Windows phase). Offer **Moonshine tiny** as "fastest, lower accuracy" and **Whisper large-v3-turbo as "most accurate, for on-demand answers only"** (its ≈1 s decode + silence misses G-C; fine when the user presses the hotkey after the question).
- This reverses the plan's "Moonshine expected" on the evidence, with the caveat that the evidence is synthetic. **Before locking the default, re-run the same script on 3–4 real recordings (the user's own consented clips) and with a call app running**; the script takes `--fixtures DIR` with `NAME.wav` + `NAME.json`.
- Not measured: faster-whisper/CUDA (deferred with Windows), Moonshine CUDA, non-English, Hindi (Moonshine lists none), Whisper distil/small.en variants (likely a cheap latency/WER gain; worth one more row).

## Licences (actual text checked)
| Item | Licence | Evidence |
|---|---|---|
| moonshine-voice 0.1.5 wheel | MIT (© 2025 Moonshine AI) | `moonshine_voice-0.1.5.dist-info/licenses/LICENSE` |
| Moonshine repo code + models | MIT; models MIT "in every language and at every size" incl. **all streaming and all English models**. Only the legacy non-streaming Arabic/Japanese/Korean/Mandarin/Ukrainian/Vietnamese Base/Tiny and Spanish Base models are under the non-commercial Moonshine Community License; TTS/G2P data have their own terms | raw `LICENSE` at github.com/moonshine-ai/moonshine (main), README § License. Plan's "NOASSERTION" worry resolved: LICENSE holds MIT + the Community licence as SECTION 1/2. Our models (tiny/small/medium streaming en) are MIT |
| Bundled ONNX Runtime (libonnxruntime 1.23.2 in wheel) | MIT (third-party, per repo note "apart from core/third-party") | wheel contents; upstream licence file not bundled in the wheel, add to THIRD_PARTY_NOTICES |
| Whisper code + weights | MIT | openai/whisper README L160 "code and model weights are released under the MIT License"; LICENSE © 2022 OpenAI |
| mlx-whisper 0.4.3 | MIT | PyPI metadata; mlx-examples LICENSE © 2023 Apple |
| `mlx-community/whisper-*-mlx` conversions | no licence field on the HF repos; derivative of OpenAI MIT weights | HF README: "converted to MLX format from `small`" |

## Install recipe for `stt/install.ts` (pinned)
Venv lives in `~/.careerloom/stt/venv` (like `prescreen-model.ts`), nothing ML in the installer; install on demand from onboarding / Copilot settings.
```
python3.12 -m venv|uv venv --python 3.12 ~/.careerloom/stt/venv      # 3.10 also works for moonshine; mlx 0.32 needs >=3.10
# Moonshine (fallback), ~74 MB venv
pip install moonshine-voice==0.1.5 numpy
python -c "from moonshine_voice import get_model_for_language, ModelArch as A; get_model_for_language('en', A.SMALL_STREAMING)"
#   CDN pin: https://download.moonshine.ai/model/small-streaming-en/quantized_26_08_21  (tiny-…/ medium-… same tag), cache ~/Library/Caches/moonshine_voice
# Whisper MLX (default), ~1.1 GB venv because mlx-whisper depends on torch (527 MB) + numba/scipy
pip install mlx-whisper==0.4.3          # resolved: mlx 0.32.3, mlx-metal 0.32.3, torch 2.14.1, numpy 2.5.3
python -c "from huggingface_hub import snapshot_download as s; s('mlx-community/whisper-small-mlx', revision='45f3915923c7a79a5a5b5a7d909d39aeb0e5630e')"   # weights.npz 481 MB
#   turbo (optional): mlx-community/whisper-large-v3-turbo @ a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb (weights.safetensors 1.6 GB)
```
Measured install time here (fast network, warm DNS): moonshine 1 s, mlx-whisper 9 s, Moonshine small model 2 s; Whisper small first load incl. download ~19 s, turbo ~58 s. Add a pinned `requirements-stt.txt` with hashes in WP3. The HF revision must be passed on load too (`path_or_hf_repo` = the local snapshot path) so the sidecar never reaches the network at session time. torch footprint is the main cost: ask in WP3 whether `mlx-whisper` can be used without importing torch (not verified).
Sidecar notes: Moonshine `Transcriber(model_path, arch, update_interval=0.1)`; one `create_stream` per source shares the model; `ort_providers` only `cpu` works in this wheel; `stream.stop()` flushes a line and `start()` re-arms.

## Reproduce
```
uv venv --python 3.12 $TMPDIR/s2/venv && . $TMPDIR/s2/venv/bin/activate
uv pip install moonshine-voice==0.1.5 mlx-whisper==0.4.3 jiwer numpy psutil
python scripts/copilot-stt-bench.py fixtures --out $TMPDIR/s2/fx
python scripts/copilot-stt-bench.py all --fixtures $TMPDIR/s2/fx --out $TMPDIR/s2/results.jsonl   # ~20 min, real-time paced
```
