---
name: 20261001-copilot-screenshots-wired
description: SS — screenshot path wired end to end (copilotScreenshot, image parts to vision models only, routing pre-capture, cleanup hooks, overlay states, Settings opt-in); verified on a cloned profile with a fake OpenRouter
type: project
---

**Task:** SS — wire PERF-3's screenshot pipeline to handler/engine/overlay. **Branch:** livelong99/copilot-screenshots. **Date:** 2026-10-01

**Files changed:**
- `electron/copilot/engine.ts`: `ProviderPrompt` content `string | parts`; `AnswerRequest.image`; `checkVision` -> `no_vision` LlmError (+suggestion), failover limited to vision models, `isVision` dep, trace `shot` info
- `electron/copilot/live-wiring.ts`: `ScreenDeps`, `screenshot()`, gate (opt-in/OCR/vision model), pre-capture at end of turn, 800 ms wait then text-only + 'ready', per-session epoch, `copilotScreen` events, clear on stop/panic/arm
- `electron/copilot/defaults.ts`, `main.ts`: Electron pipeline (desktopCapturer, overlay hidden/restored, temp dir), `sweepCopilotShots` at start, `clearCopilotShots` on `before-quit`; vision ids from the live model list
- `electron/copilot/handlers.ts`: `copilotScreenshot` real (fire-and-forget), `copilotDeleteSession` clears frames
- `electron/copilot/{screenshots,types,config,trace,models}.ts`, `providers/{openrouter,errors}.ts`, `recommended-models.json`: strict frame names + `sweepShotDir`, `engine.screenshots` (default false), `copilotScreen` event, `vision` flags
- `renderer/overlay/*`, `renderer/lib/copilot.ts`, `renderer/sections/copilot/Engine.tsx`: Screenshot button states + note line, "Read the screen" toggle, Screen Recording button, OCR labelled not available
- Tests: engine-vision, live-wiring-screen, handlers-screenshot, jev-default-off, ActionRow, engine-screen (+ small edits to existing tests). QA harness `scripts/copilot-screenshots-e2e/`, evidence `docs/plans/interview-copilot/perf/screenshots-wired/`

**Decisions made:**
- Opt-in is a new `engine.screenshots` boolean; `engine.vision` keeps the 'vision'|'ocr' choice. Alternatives: reuse `vision`.
- Blocked/failed screenshots publish `copilotScreen` (button + note), not `copilotError`: an engine error replaces the whole overlay body with a problem panel.
- No OCR: tesseract.js is not a dependency; 'ocr' blocks with a note.
- A screen turn never adopts a speculative text-only request.

**Patterns used / confirmed:** injected deps + fakes; strict-name temp files; real-app QA on clone + fake SSE server.

**Blockers & resolutions:**
- Electron ignores `$TMPDIR` on macOS -> use `getconf DARWIN_USER_TEMP_DIR` for the frame dir in QA.
- Cloned profile's models are `:free` text-only: pressing Screenshot shows "Not a vision model"; the user must pick a vision model per tier to use screenshots.

**State:** done (not pushed)

**Next steps:**
- User: `scripts/copilot-latency.mjs --live` with a key to measure an image turn (not measured here).
- Optional: real Screen-Recording-denied check on a Mac without the grant.
