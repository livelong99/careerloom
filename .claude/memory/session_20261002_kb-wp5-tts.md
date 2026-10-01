---
name: 20261002-kb-wp5-tts
description: KB-WP5 voice: TTS service (sentence splitter, fallback chain, cancel), system en_IN + Kokoro (hashed install) + OpenRouter engines, echo gate, gapless playback queue; spikes S-V1/S-T1 measured, S-E1 deferred
type: project
---

**Task:** job knowledge base WP5 (plan s.11): TTS service, playback, echo gate
**Branch:** livelong99/kb-wp5-tts (base kb-contract-v1)
**Date:** 2026-10-02

**Files changed:**
- `electron/tts/{split,service,say,kokoro,kokoro-script,install,openrouter,fake,runtime}.ts` (+ tests): engines, sentence splitter, sequential renderer with N+1 prefetch, cancel (marker msg `seq:-1,last:true`), fallback chain `buildChain`, composition root `createTtsRuntime` with the three `interview*Voice` handlers
- `electron/copilot/echo-gate.ts`: gate states, push-to-interrupt, headphone barge-in, text-echo filter, `micLeaks`
- `electron/copilot/audio-in.ts`: `gateAudioMsg` hook (owner of hook only)
- `renderer/overlay/playback/{queue,index}.ts`: PCM to AudioContext, gapless, 30 ms fade cancel, `arm()` required before any sound
- `scripts/tts-latency.mjs`, `docs/plans/job-knowledge-base/spikes/S-{V1,T1,E1}-*.md`, `electron/kb/stubs.test.ts` (my rows removed)

**Decisions made:**
- Cancel marker is `TtsAudioMsg{seq:-1,last:true}`: the frozen contract has no cancel channel. Service always sends it after any spoken utterance (renderer may still be playing buffered audio).
- Default voice order stays plan s.15 (en_IN system Rishi/Tara/Aman -> Kokoro -> OpenRouter -> system): Kokoro first-audio ~2 s warm under load vs say 0.7-1.0 s (S-T1/S-V1).
- Kokoro: CPU ONNX int8 (CoreML no gain), 17 hashed wheels (macOS arm64 cp310 only; x64/Windows unsupported until hashes added), models sha256-verified, scratch venv deleted after spike. Approved at the gate.
- `speakers` default = half-duplex only (S-E1 not run on hardware: default devices are a BT speaker).

**Patterns used / confirmed:** prescreen-model.ts install pattern (venv, steps, ready.json keyed by pin set); DI-heavy engines tested with fake process/fetch; vitest fake timers for latency/cancel.

**Blockers & resolutions:** splitter infinite loop from `'.!?…'.includes('')` being true -> explicit `has()` guard.

**State:** `done` for WP5 code; integration wiring pending (see next steps).

**Next steps:**
- Integration: construct `createTtsRuntime` in main.ts, add preload `onTtsAudio` (channel `careerloom:ttsAudio`), `ipcMain.on('careerloom:ttsPlayback', (_, e) => rt.onPlayback(e))`, route `copilotAudioIn` mic frames through `gateAudioMsg(parse(msg), rt.gate())`, replace the three voice stubs in `kb/handlers.ts` with `rt.handlers`.
- Overlay: call `attachTtsPlayer(window.careerloom).arm()` only from the explicit Practice Start.
- Settings Local models: Kokoro row needs a status IPC (contract change) + `KOKORO_DOWNLOAD_MB`; not done.
- Re-run `scripts/tts-latency.mjs` (system, kokoro) on an idle Mac; user runs S-E1 (self-test) on speakers; `CL_LIVE_TTS=1` OpenRouter check (model id `hexgrad/kokoro-82m` unverified).
