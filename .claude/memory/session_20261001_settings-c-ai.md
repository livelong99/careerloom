---
name: 20261001-settings-c-ai
description: Settings rebuild package C — Runners & models, API keys (key manager), Local models pages; one shared KeyField; revealPath + runLogTail IPC
type: project
---

**Task:** Settings rebuild package C (AI pages) on top of A backend + B shell + D integrations
**Branch:** livelong99/settings-c-ai
**Date:** 2026-10-01

**Files changed:**
- `renderer/components/settings/KeyField.tsx`: the one secret input (password, trimmed value to onSubmit once, cleared on save/cancel/Esc, error text only); reused by KeyRow, onboarding `ApiKeyField`, Copilot `ApiKeyRow`
- `renderer/components/settings/{KeyRow,ModelField}.tsx`: key row state machine (Saved/Not set, tail, used-by, needed-by-active-runner, Test, Replace, Remove + confirm); draft-with-validate model/helper-model field
- `renderer/components/settings/pages/{Runners,Keys,LocalModels}.tsx`: the three pages (replace B stubs); `ai-pages.test.tsx` (16 tests, bridge mocked)
- `electron/settings/handlers.ts` (+test), `electron/preload.ts`, `renderer/lib/types.ts`: additive `revealPath(path)` (only a `dataLocations()` path → `shell.openPath`) and `runLogTail(id, lines)` (reuses scan-history `logTail` credential filter)
- `pages/Data.tsx` (Show in Finder next to Copy path), `pages/Advanced.tsx` (Last lines per run), `SettingsShell.test.tsx` (stub test now targets Jobs)

**Decisions made:**
- No live regex validation in the renderer: A's `KeyInfo` carries only `formatHint`; main's validation message is shown on save. Alternatives: mirror regexes (drift risk).
- Per-task routing is a read-only table (main vs helper tier, Copilot/local links); no new setting exists in the contract.
- "Use this runner" disabled until the runner is ready (matches onboarding).
- Memory row on Local models is informational only: `os.freemem()` on macOS reads low because of cache.
- STT install only for the engine configured in Copilot (`copilotInstallStt` has no engine arg); other engines show status.

**Patterns used / confirmed:** QA by driving a built app over CDP (`--remote-debugging-port`) on a cloned profile; `Page.reload` (not `location.reload()`) to pick up a rebuilt bundle.

**Blockers & resolutions:** none.

**State:** done (pending lead gate)

**Next steps:**
- Copilot `Transcription.tsx` still has its own Install button (package E owns it); point it at Settings › Local models.
- Keychain-unavailable notice needs a signal from A (not in `KeyInfo`).
