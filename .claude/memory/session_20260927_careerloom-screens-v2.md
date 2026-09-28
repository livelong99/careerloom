---
name: 20260927-careerloom-screens-v2
description: "Careerloom v2 — Resume/Monitoring/Integrations screens, Pipeline filters+kanban, ⌘K palette, Tailwind+shadcn kit from VoiceStudio/paperclip, Firecrawl per autoshorts"
metadata:
  node_type: memory
  type: project
  originSessionId: deac2367-bf24-4ed3-8108-2de3c6ff242f
  modified: 2026-09-27T12:36:37.265Z
---

**Task:** Add Resume, Monitoring, Integrations screens; richer Pipeline; better navigation. Pull UI components from paperclip + VoiceStudio.
**Branch:** main (uncommitted — user hasn't asked to commit)
**Date:** 2026-09-27

**Files changed (by owner):**
- Lead: `electron/context.ts` (shared settings/launch/runScript/startAgent, runs.jsonl history + claude usage), `electron/contract.ts` (feature IPC types; renderer/lib/types.ts re-exports), `main.ts` (FEATURES registry, evaluateJob with Firecrawl prefetch, FIRECRAWL_URL env), `renderer/styles/tw.css` (Tailwind v4 no-preflight + shadcn token bridge + paperclip/VoiceStudio var shims), `components/ui/*` (VoiceStudio + paperclip shadcn), `components/kit/*`, `CommandPalette.tsx`, Sidebar/App nav.
- Builders: `electron/{resume,metrics,tracker-actions,integrations}.ts` + `electron/integrations/*`, sections + `components/{resume,monitoring,pipeline,integrations}/*`.

**Decisions made:**
- Tailwind v4 WITHOUT preflight, shadcn tokens mapped to codeburn vars: lets paperclip/VoiceStudio components drop in unchanged. Alt (port each to plain CSS) rejected — too much rewrite.
- Feature contract types live in `electron/contract.ts` (tsc rootDir=electron forbids importing renderer/).
- Firecrawl modeled on autoshorts: bundled pinned compose piped via stdin (`careerloom-firecrawl`), loopback-only base URL, SSRF guard incl. DNS lookup; external composeDir optional + validated.
- Plugin secrets go to career-ops `.env` (its plugin host reads env), our own secrets via safeStorage.
- Same-tree parallel builders with strict file ownership (no commits existed → no worktrees).

**Blockers & resolutions:**
- Pulled components referenced paperclip-only CSS vars (--sz-*, --pct-*, --rad-*) → defined in tw.css.
- window.prompt unsupported in Electron → Dialog.
- Unlayered codeburn CSS (.opt-finding grid) beat Tailwind → avoid those class names in Tailwind components.

**State:** done — 249 tests, both tsc configs, build green; visually QA'd live.

**Next steps:**
- Commit once user approves; replace build/icon.*; confirm RELEASES_REPO owner in electron/updates.ts.
- Verify codex/agy/API runners and Firecrawl start/scrape live (needs Docker).
- Resume: ATS scores a cv.md-derived HTML, not the exported template; PDF/DOCX export goes through the agent.
