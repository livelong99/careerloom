---
name: 20260927-careerloom-bootstrap
description: "Bootstrapped Careerloom — Electron desktop UI over career-ops, forked from codeburn's app/ (Electron+React19+Vite), runners claude/codex/agy/OpenRouter"
metadata:
  node_type: memory
  type: project
  originSessionId: deac2367-bf24-4ed3-8108-2de3c6ff242f
  modified: 2026-09-27T10:50:29.587Z
---

**Task:** Build Careerloom (job-search AI engine UI on top of career-ops) reusing codeburn's desktop app as base.
**Branch:** main (nothing committed yet — user did not ask)
**Date:** 2026-09-27

**Files changed:**
- `electron/main.ts`: rewritten — IPC `careerloom:*` handlers, settings in userData/settings.json, OpenRouter key via safeStorage (never to renderer), run registry streaming to renderer, codeburn updater wired.
- `electron/runner.ts`: distilled from codeburn cli.ts — PATH resolution for GUI apps, process-group kill, Windows .cmd escaping; MODES catalog; claude runs `-p /career-ops <mode> --output-format stream-json --permission-mode acceptEdits --allowedTools ...` (no skip-permissions).
- `electron/careerops.ts`: parser for data/applications.md (by header), pipeline.md, reports; readReport guarded to reports/ + output/. Tracker links `../reports/x` re-based to dataRoot.
- `electron/updates.ts` + renderer UpdateBanner/useUpdateStatus: ported from codeburn; `RELEASES_REPO` guessed as `livelong99/careerloom`, tags `vX.Y.Z`.
- `renderer/sections/{Overview,Pipeline,Inbox,Agent,Settings}.tsx`, `components/{ReportDrawer,Markdown,Badges}.tsx`, `lib/{stages,theme,types,ipc}.ts`, `hooks/useRuns.ts`: new UI.
- `renderer/styles/careerloom.css`: token overrides (teal thread + amber, ivory/ink) layered on codeburn plain.css/indigo.css.
- `.github/workflows/{release,ci}.yml`, `build/icon.*` (codeburn placeholder icons — replace).

**Decisions made:**
- Desktop Electron over web: must spawn local CLIs using the user's subscriptions. Alternatives: Tauri (autoshorts uses it) — rejected to keep codeburn base intact.
- career-ops stays an external checkout; Careerloom reads its files, agents write them (DATA_CONTRACT user layer). Alternative (vendoring career-ops) rejected — breaks its updater.
- English-only new strings; i18n infra kept (common/shell/shared catalogs) for later.
- Dropped codeburn CLI bundling (after-pack, stage-cli), tray/menubar companions (mac/ Swift, windows/ Tauri), telemetry, Store/AppX/snap.

**Blockers & resolutions:**
- Sankey labels clipped → gutter estimate ignored " · amount" suffix; fixed in Sankey.tsx.
- Electron file:// cached old bundle on reload → restart app to verify.

**State:** in_progress — app builds, 158 tests pass, verified live (claude run streamed + cancelled).

**Next steps:**
- Confirm GitHub repo owner for `RELEASES_REPO` in electron/updates.ts and add `repository` to package.json.
- Replace build/icon.icns + icon.png with a Careerloom icon.
- Verify codex/agy/API runners end-to-end (only claude was run live).
- Persist run history to userData (currently in-memory, ponytail note in main.ts).
