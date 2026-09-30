---
name: 20261001-copilot-wp1-overlay
description: Copilot WP1 — overlay window, hotkeys, tray, panic kill switch, Privacy mode, overlay renderer (8 states), fake event generator; QA evidence on cloned profile
type: project
---

**Task:** Interview Copilot WP1 (plan.md §11, §3.5). **Branch:** livelong99/copilot-wp1-overlay. **Date:** 2026-10-01

**Files changed:**
- `electron/copilot/{overlay-window,hotkeys,tray,tray-icons,panic,privacy-mode}.ts`: real implementations (DI'd electron, vitest with fakes). Privacy flags live only in privacy-mode.ts.
- `electron/copilot/{overlay-host,overlay-runtime,overlay-fake,overlay-events}.ts`: wiring (`publishState`, `setSessionHooks`, `onAction`), real-electron glue, dev fake (`CL_COPILOT_FAKE=cycle|<state>`), private main→overlay channel.
- `electron/copilot/handlers.ts`: real copilotOverlay/copilotStop/copilotAckPrivacyNotice/copilotCheckHotkey; copilotSetConfig drops `privacy.mode.noticeVersion` (only the ack handler may set it).
- `electron/main.ts` (+2 lines), `vite.config.ts` (second page `overlay.html`).
- `renderer/overlay/**`, `renderer/overlay.html`, `renderer/lib/copilot.ts`, `renderer/components/copilot/{OverlayPreview,PrivacyModeNotice}.tsx`.

**Decisions made:**
- Overlay = separate Vite page (no legacy CSS), card is click-through except under the pointer (hover IPC = `copilotOverlay({passive})`); "hold ⌃⌥" is not possible with globalShortcut.
- Heartbeat = empty `copilotOverlay({})` (no contract change); also notices config changes (1 file read/s).
- Quick-hide wipe + layout pushes use private channel `careerloom:copilotOverlayCmd`.
- Overlay replays last state after page load (events sent before load are missed).

**Blockers & resolutions:** no-masquerade test allows only `setAppUserModelId('app.careerloom.desktop')` (= build.appId) in main.ts.

**State:** done (awaiting G-E1)

**Next steps:**
- WP3: call `host.publishState`/`setSessionHooks` from session.ts; WP4: Start/Retry/micOnly/debrief buttons need contract calls (rendered disabled now); Privacy page uses PrivacyModeNotice + `copilotAckPrivacyNotice`.
- Evidence: `docs/plans/interview-copilot/wp1-evidence/`.
