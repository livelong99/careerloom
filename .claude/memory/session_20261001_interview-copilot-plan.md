---
name: 20261001-interview-copilot-plan
description: Interview Copilot research, design + static prototype and implementation plan (docs only, no product code) on branch livelong99/feat-copilot-plan
type: project
---

**Task:** Plan the Interview Copilot (config screen + overlay) after analysing Open-Cluely (no licence, clean-room only).
**Branch:** livelong99/feat-copilot-plan · **Date:** 2026-10-01

**Files changed (docs only):**
- `docs/plans/interview-copilot/research.md` + `research-notes/A..F`: Open-Cluely analysis and reuse matrix, feasibility with cited sources, overlay techniques, responsible use, component shortlist.
- `docs/plans/interview-copilot/design.md` + `prototype/` (config.html, overlay.html, css, js, `shots/`, `shoot.sh`): clickable static prototype, dark + light.
- `docs/plans/interview-copilot/plan.md`: architecture, IPC types, storage, config schema, WP0-WP5 with file ownership and gates, test/packaging/rollout, risks, open questions.

**User decisions round 2 (2026-10-01):** STT = fastest accurate local engine via bake-off (spike S2), Moonshine Voice streaming expected (MIT, streaming API, macOS/Windows/Linux, claimed 34-107 ms; CUDA NOT documented; no Hindi STT), Whisper MLX/faster-whisper alternates; proper model-selection fields (STT engine/model/compute + benchmark; OpenRouter model per tier with Test); every session belongs to exactly one Job (job has many sessions; `copilotSessionsForJob` for the Job page); 3-month retention accepted for consent copy; open: voice practice on Windows, NVIDIA box for CUDA check.

**User decisions round 1 (2026-10-01):** STT = Whisper on MLX (local, Apple Silicon; mlx-whisper has no documented streaming, so chunked pseudo-streaming + spike S2); LLM = OpenRouter (data_collection deny, SSE, skip `: OPENROUTER PROCESSING`); answer-on-demand default; Windows = Practice only; transcript retention 3 months, editable in app.

**Earlier decisions (provisional, lead-approved, user to confirm; all listed in plan.md §15):**
- Open-Cluely is the user's own project: code/prompts are PORTED (per-WP port map in plan.md §11); never port disguise identities, plaintext keys, LAN companion.
- Responsible-use option B (practice first; per-session consent; system audio off by default) plus an opt-in Privacy mode group, OFF by default, one-time notice: hide-from-capture (unreliable on macOS 15+ ScreenCaptureKit), no Dock icon, neutral title, click-through, quick hide, indicator full/dot/off (tray icon always on). Not included: process-name masquerading, fake identities, anything defeating proctoring.
- MVP = practice + mic-only + streaming API runner; then system audio (spike gate), screenshots, local-only. macOS first.
- New in-process SSE streaming runner; agent CLIs not viable for live. Budget about 0.30 USD per interview.
- Components: shadcn `message bubble marker message-scroller` + prompt-kit `response-stream text-shimmer loader`; hand-build meter/stepper/suggestion card; avoid coss ui (AGPL), Aceternity, AI Elements heavy parts.

**Patterns used / confirmed:**
- Headless Chrome shots need kill-after-file pattern (`prototype/shoot.sh`); Chrome otherwise lingers until timeout.
- `.brand` class collided with a badge tone: scope layout rules narrowly when mixing with legacy CSS.

**Blockers & resolutions:**
- `electron/job-view/*` absent on this branch → lives in sibling worktree feat-job-page (reportParse.ts, jdStructure.ts); plan depends on it (fallback heading splitter).

**State:** `done` (plan delivered; nothing implemented)

**Next steps:**
- User confirms open questions in plan.md §18; then dispatch WP0 (contract + shell) and run gate G-A.
- Spike S1 (macOS system audio on Electron 43) before promising M2; pick STT provider at gate G-C from the latency harness.
