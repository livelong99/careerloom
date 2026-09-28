---
name: 20260928-boards-release-cloud
description: Jobs/Boards split, browser login + scroll fixes, codex --sandbox fix, v0.1.1 release, launch films, repo memory + /cloud-setup for cloud sessions
metadata:
  type: project
---

**Task:** Boards screen, browser-board reliability, codex fix, release 0.1.1, cloud-session setup
**Branch:** main · **Date:** 2026-09-28

**Files changed:**
- `renderer/sections/Boards.tsx`, `components/boards/*`: new Boards screen (table, editor, Scans, New scan); PortalRail removed, Jobs full width.
- `electron/integrations/browser-*.ts`: Chrome-profile default login, nav lock via --init-page (replaced --allowed-origins, which blanked LinkedIn), 1500px×5 scroll then one snapshot, --snapshot-mode none, private cwd for runs.
- `electron/runner.ts`: codex `exec --sandbox workspace-write` (`--full-auto` removed in codex 0.157).
- `electron/context.ts`: signal exit → cancelled; redacted log tail in `run-logs/`; `main.ts` getRunLog uses runLog.
- `.claude/memory/*`, `.claude/commands/cloud-setup.md`, `CLAUDE.md`: memory in repo + cloud bootstrap prompt.

**Decisions made:**
- Pre-screen model = Manav2op/verdict-small (CPU) + public ESCO/TechWolf base; laya-mlx removed. Alternatives: Julia-1, Laya.
- ego-lite rejected (macOS-only closed browser, no read-only guarantee).
- Plugins are installed in cloud sessions by `/cloud-setup`, not committed.

**Blockers & resolutions:**
- LinkedIn login page → login source defaulted to "off" + origin allowlist blocked licdn CDN → Chrome default + nav lock.
- Snapshot cost → navigate/wait weren't the leak; per-snapshot size × turns is.

**State:** done

**Next steps:** see [[careerloom-overview]] open items.
