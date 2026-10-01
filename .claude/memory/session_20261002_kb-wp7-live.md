---
name: 20261002-kb-wp7-live
description: KB-WP7 live-session surfacing of the question base: QUESTION BASE prefix block (<=700 tok), top-3 matches in the user turn, guard keeps KB text out of candidate facts, KbChip, Settings toggle, kb trace stage
type: project
---

**Task:** KB-WP7 (job-knowledge-base plan s.11 WP7, s.6.1) on top of kb-int (tag kb-contract-v2)
**Branch:** livelong99/kb-wp7-live
**Date:** 2026-10-02

**Files changed:**
- `copilot/kb-live.ts` (new): `kbLive().block/match`, gated on `interview.json kb.useInLive`, retrieval via `kb/retrieve`, source title via `findSource`
- `copilot/context.ts`: `buildGrounding(job, cv, kb)` places `## QUESTION BASE` before CANDIDATE FACTS, capped 700 tokens, neutralized; cv still trimmed first; `ContextDeps.kbBlock`
- `copilot/prompts.ts`: `PromptInput.kb` -> "RELATED QUESTIONS FROM THE QUESTION BASE" in the user turn only (system prompt untouched => cache prefix byte-stable)
- `copilot/engine.ts`: `EngineDeps.kbMatch` (try/catch, skipped for `brief` route), `Suggestion.kb` refs (no outline), trace marks `kbStartAt/kbDoneAt` -> `StageMs.kb`
- `copilot/guard.ts`: proof with a `kb` source is always dropped; KB text is never in `known`, so a number only in a KB item is flagged
- `copilot/types.ts` (additive): `KbRef`, `Suggestion.kb?`; `kb/{types,defaults,config}.ts` + `renderer/lib/kbFake.ts`: `kb.useInLive` (default true)
- `copilot/defaults.ts`: wires `kbBlock` + `kbMatch`; `renderer/overlay/{KbChip.tsx,SuggestionCard.tsx,overlay.css}`; Settings > Interview prep toggle
- `scripts/copilot-latency.mjs --kb`, `scripts/kb-wp7-shots/` (chip shots harness), shots in `docs/plans/job-knowledge-base/qa/wp7/`

**Decisions made:**
- Setting default ON, absent KB degrades silently (retrieve/prefix return []/''). KB is injected as deps so `context.ts` stays Electron-free in tests.
- Chip link goes through the existing `kbOpenSource(sourceId)` (main resolves URL + allow-list); no URL in the renderer.

**State:** done
**Next steps:** live check on a real session with a researched KB (needs the user's key); KB revision changing mid-session only affects the next session's prefix.
