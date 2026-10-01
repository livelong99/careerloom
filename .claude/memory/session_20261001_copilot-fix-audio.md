---
name: 20261001-copilot-fix-audio
description: Copilot audio input fixes (dev mic permission on 127.0.0.1, stale faster-whisper engine, missing-mic health, device fallback/reopen, Audio page, system audio coming soon); branch livelong99/fix-audio-input
type: project
---

**Task:** FIX-AUDIO from user's real-app testing. **Branch:** livelong99/fix-audio-input. **Date:** 2026-10-01

**Files changed:** audio-perms.ts (127.0.0.1, no video), main.ts (check handler), source-health.ts + session.ts (`missing` + capture error), config.ts (stale engine), stt/{runtime,whisper-mlx,moonshine}.ts (actionable not-installed), capture/mic.ts + useMicCapture.ts (fallback, resume, reopen), lib/copilot.ts (capture error clears), Audio.tsx, Transcription.tsx; tests alongside; docs/plans/fixes/audio/ (findings, shots), scripts/copilot-e2e/audio-qa.mjs.

**Decisions made:**
- Fix at boundaries (config normalisation, shared adapter message) rather than per caller. Alternatives: per-screen guards.
- Kept 2.5 s silent threshold (plan acceptance); BT start-up grace deferred to hardware feedback.

**Blockers & resolutions:** fake audio file read fails with the audio sandbox → `--disable-features=AudioServiceSandbox`.

**State:** done. **Next steps:** user runs the hardware steps in docs/plans/fixes/audio/findings.md.
