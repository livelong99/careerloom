# S-T1 — Kokoro first-audio and RAM (WP5)

Setup: scratch venv under `/private/tmp/claude-501/tts-spike` (deleted after this write-up), CPython 3.10.16, Apple Silicon, 16 GB. Packages = the 17 hashed pins in `electron/tts/install.ts` (`pip --require-hashes --no-deps`; all hashes resolved, no loosening). Models: `kokoro-v1.0.int8.onnx` (92.4 MB, sha256 6e742170…6406cb), `voices-v1.0.bin` (28.2 MB, sha256 bca610b8…1fbf4a) from `thewh1teagle/kokoro-onnx` release `model-files-v1.0`. `--selftest` of the shipped sidecar script passes. One model process at a time (no Whisper/other model running; checked `pgrep`).

**Caveat:** the Mac was heavily loaded by other agents during every run (load average 17–25, 40 % memory free). Numbers are pessimistic; re-run on an idle machine with `node scripts/tts-latency.mjs --engine kokoro` (also `--engine system`) before final G-T.

## Results (sidecar protocol, CPU provider, voice af_heart, speed 1.0)
| Run | load | first audio, cold (1st request) | warm p50 | warm p95/max | RSS |
|---|---|---|---|---|---|
| driver A (n=9) | 1.4 s | 4.77 s (112 ch) | 2.22 s | 5.45 s (112 ch) | 170–355 MB |
| `scripts/tts-latency.mjs` (n=8) | 0.8 s | 2.61 s (51 ch) | 2.03 s | 3.82 s | 160–298 MB |
| CoreML provider (driver A, n=4) | 6.2 s | 4.10 s | 2.56 s | 5.63 s | 182–420 MB |

- Real-time factor ≈ 0.8–0.9 on CPU under load: a 4.9 s sentence needs ≈ 3 s. `create_stream` yields per phoneme batch, but a short sentence is one batch, so first audio ≈ whole-sentence render.
- **RAM: ≈ 160–300 MB RSS (peak 420 MB with CoreML)** ≪ the 1.5 GB `assertMemory()` floor; Kokoro next to Whisper small (≈ 1 GB) is comfortably within 16 GB, but plan §10 (one heavy process) still holds for Chrome/research.
- CoreML EP: no gain and a 6 s load, so CPU stays the provider.
- Python deps ≈ 60 MB + models 120 MB download.

## Decision input for G-T
Kokoro is **slower to first audio (≈ 2 s warm under load) than the system en_IN voices (0.7–1.0 s)**, so the default order stays plan §15: **installed en_IN system voice (Rishi → Tara → Aman) → Kokoro → OpenRouter Kokoro → any system voice**. Kokoro's value is quality/consistency and non-macOS later, not speed. N+1 prefetch hides the latency after the first sentence (sentence audio 2.3–4.9 s vs render 1.6–3.8 s); the opening question must be pre-rendered at session start. Re-check on an idle machine before changing the order.
