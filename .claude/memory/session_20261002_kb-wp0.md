---
name: 20261002-kb-wp0
description: KB-WP0 contract, shell, config skeleton for the job knowledge base + AI interviewer (kb types, kb* IPC stubs, interview.json, key ids, Settings/Job stubs, module stubs); tag kb-contract-v1
type: project
---

**Task:** KB-WP0 (plan.md s.11): freeze the contract so WP1-6 never touch shared files.
**Branch:** livelong99/kb-wp0-contract (off kb-int). **Date:** 2026-10-01/02

**Files changed:**
- `electron/kb/types.ts`, `electron/interviewer/types.ts`: all types (KbItem..., KbApi, KbEvents, KbBridge, InterviewConfig, InterviewPlan...).
- `electron/kb/handlers.ts` (+test): 17 stubs `{status:'not-implemented'}`; `interview*` refused off macOS, `kb*` allowed everywhere (plan s.13).
- `electron/kb/config.ts` (+test): interview.json load/normalise/clamp/merge/write (0600). No migration needed (new file); readAloud read-through is a no-op because default engine is `system`.
- `electron/contract.ts`, `main.ts` (FEATURES), `preload.ts` (kb*/interview* + `onKbEvent` + `kbTtsPlayback` send), `renderer/lib/types.ts` (`& KbBridge`), `copilot/types.ts` (`StartRequest.interview?`, `SessionDetail.interview?`), `context.ts` (RunRecord.runner += 'research').
- `settings/{types,prefs,keys,keys-test}.ts`: `brave|exa|serper` ids, format hints; test call is a no-request stub (WP6).
- Settings `interview-prep` page after Copilot (13 pages) + stub; Job page 7th tab 'Knowledge base' + `KnowledgeTab` stub; Runs kind `research` for mode `job-research`.
- Interface-only module stubs (plan s.3.1) throw `Not implemented yet (WPn)` via `kb/todo.ts`; `kb/stubs.test.ts` lists them (each owner removes its row).

**Decisions:** InterviewConfig lives in kb/types (shared by main + renderer). searxngUrl allows http only on loopback. never-fetch hosts are not a setting.
**State:** done. **Next steps:** WP1/2/3/4/5/6 start from tag `kb-contract-v1`; WP5 adds the main-side `ipcMain.on('careerloom:ttsPlayback')` and the overlay `ttsAudio` listener.
