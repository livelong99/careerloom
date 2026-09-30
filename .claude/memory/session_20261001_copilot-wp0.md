---
name: 20261001-copilot-wp0
description: Interview Copilot WP0 — frozen IPC/config contract, stub handlers + module stubs, Copilot section shell (macOS only), copilot.json config; branch livelong99/copilot-wp0-contract
type: project
---

**Task:** WP0 of docs/plans/interview-copilot/plan.md (§11): contract, shell, nav. No behaviour.
**Branch:** livelong99/copilot-wp0-contract (tag `copilot-contract-v1` after G-A)
**Date:** 2026-10-01

**Files changed:**
- `electron/copilot/types.ts`: frozen contract (CopilotApi, CopilotEvents, CopilotConfig, session/consent types, CopilotBridge); `contract.ts` re-exports it (`export type *`).
- `electron/copilot/{handlers,capabilities,config}.ts` (+tests): 22 stub handlers return `{status:'not-implemented',method}`; every call refused off macOS; config get/set validated per field, atomic write.
- `electron/copilot/{overlay-window,hotkeys,tray,panic,privacy-mode,context,detector,engine,prompts,guard,cost,redact,store,practice,debrief,session}.ts`, `stt/adapter.ts`: interface-only stubs so WP1-4 never touch shared files.
- `main.ts` (FEATURES entry), `preload.ts` (24 invokers + `onCopilotEvent` + `copilotAudio` send), `renderer/lib/types.ts` (`& CopilotBridge`), `Sidebar.tsx` (Interview group, mac only, key 8), `App.tsx` (TITLES/KEYS/body, `sectionAvailable`), `icons.tsx` (`mic`).
- `renderer/sections/Copilot.tsx` + `renderer/sections/copilot/*.tsx` (10 stub pages, WP4 replaces bodies, keeps export names).

**Decisions made:**
- `copilotReadiness.stt` is `'ready' | 'not-installed'` (plan said `'no-key'`; local STT has no key).
- Hotkeys are Electron accelerators (`Control+Alt+A`…); `panic` is forced to its default in `normalizeConfig` (plan: fixed).
- Stub handlers return a value, not throw, so typed bridge return types stay plain (no union burden on WP4).
- Bad config field falls back to its default per field; unknown keys dropped; version always rewritten as 1.

**State:** done (pending G-A approval)

**Next steps:**
- WP1-4 implement their stub files; only the WP0 owner changes `types.ts` (tag copilot-contract-v1).
- `ipcMain.on('careerloom:copilotAudio')` listener is WP3's.
