---
name: 20260927-installers-prescreen
description: "Careerloom v0.1.0 installers built (mac dmg arm64/x64, win NSIS x64+arm64), laya pre-screen 3-bucket Jobs UI, onboarding, Loomi logo, security fixes"
metadata:
  node_type: memory
  type: project
  originSessionId: deac2367-bf24-4ed3-8108-2de3c6ff242f
  modified: 2026-09-27T15:35:35.361Z
---

**Task:** Production-ready installers + final polish, Loomi logo, laya-mlx pre-screen before evaluation
**Branch:** main (nothing committed — user hasn't asked)
**Date:** 2026-09-27

**Files changed:**
- `package.json`: electron-builder config (dmg+zip arm64/x64, ad-hoc identity '-', nsis x64+arm64, `toolsets.nsis '1.2.1'` for Apple-Silicon makensis)
- `build/` + `build/brand/`: Loomi avatar icon (icns/ico/png) and brand kit; `renderer/assets/loomi.svg`
- `electron/onboarding.ts`, `renderer/sections/Onboarding.tsx`: 5-step first-run flow (welcome/tools/workspace/agent/résumé)
- `electron/prescreen*.ts`, `renderer/components/jobs/prescreen.tsx`: laya-decide MCP pre-screen, buckets likely/uncertain(“Needs agent”)/unlikely, keyword fallback
- `electron/main.ts`: setRoot only accepts dirs returned by the native picker (pickedDirs) or current root
- `electron/prescreen-mcp.ts`: 2MB stdout line cap, SIGKILL 5s after close
- `renderer/styles/careerloom.css`: dark theme now sets --ok/--warn (light greens leaked into dark)
- `renderer/components/jobs/JobsTable.tsx`: LocationCell (first site +N), Pre-screen column after Title

**Decisions made:**
- Pre-screen gate is keyword-disqualifier-first; laya fit only orders/decides at ≥0.8/≤0.2 (model range 0.09–0.68 on real data). Nothing discarded.
- Unsigned builds for now (ad-hoc mac identity); signing needs Apple Developer ID / Windows cert.

**Blockers & resolutions:**
- Electron serves cached file:// bundle after rebuild → restart app, not reload.

**State:** done

**Next steps:**
- Confirm `RELEASES_REPO` in `electron/updates.ts` (guess `livelong99/careerloom`)
- Code signing + notarization when the user has certificates
- Commit when the user asks (no Co-Authored-By per project CLAUDE.md)
