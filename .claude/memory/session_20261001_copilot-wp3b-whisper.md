---
name: 20261001-copilot-wp3b-whisper
description: Copilot WP3b: Whisper MLX adapter + VAD/chunker, Whisper small default (S2), benchmark and audio-probe backends, Transcription page copy; live-verified locally ($0)
type: project
---

**Task:** WP3b (follow-up to WP3 using the S2 report). **Branch:** livelong99/copilot-wp3b-whisper (base copilot-int). **Date:** 2026-10-01
**Files changed:**
- `electron/copilot/stt/{vad,buffer}.ts`: RMS VAD (adaptive floor, LOUD cap) + utterance chunker (partial ~1 s, final after endSilenceMs, audio-clock times) → any non-streaming decoder behaves like a streaming `SttAdapter`.
- `stt/{decoder,whisper-mlx,whisper-script,child}.ts`: request/response python sidecar (frame type 4), one restart that resends unanswered audio, HF_HUB_OFFLINE at session time; `moonshine.ts` now shares `child.ts`.
- `stt/{runtime,engines,install}.ts`: per-engine pins/models/sizes, `defaultEngine()` (Whisper on arm64 mac, Moonshine else), per-engine install (`installStt(engine, model)`), pinned HF revisions.
- `stt/{benchmark,bench-run,bench-fixture,bench,probe}.ts`: `copilotBenchmarkStt` (macOS `say` fixture, unpaced pass = RTF/WER, paced pass = latency) and `copilotProbeAudio` (renderer streams mic over `copilotAudio`, main listens).
- `defaults.ts`, `config.ts`: wiring; default engine by platform, endSilenceMs 650; benchmark saves `lastBenchmark` only for the configured model.
- `renderer/{components/copilot/catalog.ts,sections/copilot/{Transcription,Audio}.tsx}`, `scripts/copilot-shots/mock.ts`, plan.md, S2 report + bench script pulled from the S2 branch.
**Decisions:** Whisper small default, Moonshine small fallback, turbo "most accurate (on demand)" (S2). VAD in TS not python so it is unit-testable and engine-agnostic. Benchmark RAM stays null (MLX RSS under-reports, S2). Venv really is ~1.3 GB on disk (S2 said 1.1): UI says 1.3.
**Bugs found live:** VAD floor learned from speech when audio starts mid-word → first utterance dropped; fixed with LOUD_RMS cap.
**Live ($0, scratch STT dir, never ~/.careerloom):** whisper small contract test passes (final 553 ms after speech end); benchmark p50 772 ms, RTF 0.06, WER 0.114 on 4 synthetic sentences, run 25 s.
**State:** done. **Next steps:** real consented clips + call app running before locking default (S2 caveat); existing copilot.json with explicit engine 'moonshine' is not migrated; system-source probe says "missing" until M2 capture; Windows/faster-whisper out of scope.
