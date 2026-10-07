# STT + audio pipeline QA (branch livelong99/stt-audio, from feat/debug-log bdd872d)

Real sidecars, one model at a time: Parakeet TDT 0.6B v3 (onnx-asr 0.12.0 / onnxruntime 1.23.2, py3.10) and mlx-whisper small. Audio: macOS `say` (Samantha) → 16 kHz PCM16, pauses inserted as digital silence (TTS padding trimmed), played in real time through `createChunkedAdapter` with `endSilenceMs 650, fastEndpoint` (the interviewer path).

## Root cause of the split question (Windows Moonshine/Parakeet complaint)
`buffer.ts` ended the turn after 650 ms of quiet, or after ~230 ms when the early decode looked sentence-final. A 20–40 s question with 1.5 s thinking pauses or "um…" therefore became one final per pause, and `live-wiring` detects each final on its own. Also `MAX_SEGMENT_MS` (25 s) cut long monologues mid-speech.

## Fix
- `endpoint.ts`: `endsTurn()` = "?"-final or a short standalone prompt ("Tell me about yourself."). Anything else (statement, "um", comma) is not a turn end. `CONT_EXTRA_MS = 1250`.
- `buffer.ts` (fast mode): only `endsTurn` text ends early (~230 ms + decode); everything else waits `endSilenceMs + 1250` (1.9 s at the default). Segment cap 25 s → 50 s; partial decodes stop past 20 s so they cannot delay the final.
- `session.ts`: practice answers (no early decode) get `endSilenceMs + 1250` too, so a pause mid-answer no longer ends the answer.

## Results (final latency = last final minus end of speech; real time)
| sample | expected | before: finals / WER / lat | after: finals / WER / lat |
|---|---|---|---|
| Parakeet short (3 s) | 1 | 1 / 0 / 235 ms | 1 / 0 / 255 ms |
| Parakeet "um…" (1.2+1.3 s pauses) | 1 | 3 / 0 / 455 | 1 / 0.05 / 738 |
| Parakeet 25 s, 1.5 s pauses | 1 | 4 / 0 / 345 | 1 / 0 / 1108 |
| Parakeet 42 s, 1.5 s pauses | 1 | 5 / 0.01 / 379 | 1 / 0.01 / 1641 |
| Parakeet two questions, 3.5 s gap | 2 | 2 / 0 / 412 | 2 / 0 / 428 |
| Parakeet 6 s hiss | 0 | 0 | 0 |
| Whisper short | 1 | 1 / 0 / 366 | 1 / 0 / 372 |
| Whisper "um…" | 1 | 3 / 0.025 / 501 | 1 / 0 / 668 |
| Whisper 25 s | 1 | 4 / 0 / 422 | 1 / 0 / 825 |
| Whisper 42 s | 1 | 5 / 0.01 / 410 | 1 / 0.01 / 1091 |
| Whisper two questions | 2 | 2 / 0 / 518 | 2 / 0 / 528 |
Short questions are unchanged. Long ones show higher "latency" only because the one final now decodes the whole question (the old numbers are the last fragment of a question already broken into pieces).
Decode cost per second of audio: Parakeet RTF 0.046 (3 s) … 0.086 (41 s); with onnxruntime 1.24.2 on py3.13 0.03; Whisper small MLX 0.034 → 0.021.
Known limit: "…with your manager, [1.6 s] and what you did…" — Parakeet/Whisper punctuate the first half with "?" so it still ends early (2 finals). A pause longer than 1.9 s after a statement also splits.

## Other bugs fixed
- `child.ts`: stderr was dropped → now in the debug log (`src: stt`, `stderr` lines, `exit` code/signal, `spawn failed`). A python that cannot start (venv deleted) emitted no exit → adapter hung until the ready timeout; now reported as an exit.
- `decoder.ts` / `sidecar.ts`: a sidecar that exits before `ready` (missing package, bad model) hung 60–120 s and was retried pointlessly; now `start()` fails at once with the script's own message.
- `runtime.ts` / `install.ts`: onnxruntime 1.23.2 has no win_arm64 wheel (pip: "from versions: none") → `parakeetPackages()` uses 1.24.2 there (verified it decodes the same model on macOS: WER unchanged, faster). A failed or cancelled reinstall deleted ready.json, orphaning a working install → `restoreReady()`. A failed self-test (corrupt/truncated download) left the bad blob in the cache so every retry failed → `dropModelCache()` and a clear message.
- Real SIGKILL of the Parakeet sidecar mid-session: restarted once, pending decode resent, both finals correct (exit logged).

## Tests added
buffer.test.ts (+4: statement + 1.5 s pause stays one final, hold vs early, 40 s not cut / 52 s cut, no partials past 20 s), endpoint.test.ts (+1), child.test.ts (new, 2), decoder.test.ts (+1), sidecar.test.ts (+1), engines.test.ts (+2: arm64 pin, install rollback), session.test.ts (+1).

## Unresolved / notes
- VAD: steady noise louder than ~-26 dBFS RMS (LOUD_RMS cap) is treated as speech; not seen with mic noise suppression on, possible with loud background music on the system channel.
- mlx-whisper needs no setuptools pin here (selftest passes without pkg_resources); the pin stays on faster-whisper only.
- Not run: Windows, CUDA, real arm64 Windows wheel install, real USB unplug (capture-side fallback/onEnded already have tests).
- `orca orchestration send` failed in this worktree ("Unable to determine Orca.app path"), so heartbeats were not delivered.
