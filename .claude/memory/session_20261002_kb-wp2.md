---
name: 20261002-kb-wp2
description: KB-WP2 research pipeline for the job knowledge base (search adapters, SSRF/robots/denylist-safe fetch, poison guard, extract/dedupe/classify/generate, budget, checkpoint resume, Run registration) on fakes; S-R1 live run not run (needs key)
type: project
---

**Task:** KB-WP2 (plan.md s.11): research pipeline, fake search + fake fetch, no keys. **Branch:** livelong99/kb-wp2-research (off kb-contract-v1). **Date:** 2026-10-01/02

**Files changed:**
- `electron/kb/sources.ts`: never-fetch constant (linkedin, indeed.*, glassdoor.*, teamblind, leetcode, reddit, medium + subdomains), host tiers/licences, attribution.
- `electron/kb/research/search/*`: Brave/Exa/Serper/SearXNG adapters (documented response shapes, key never in errors), scripted fake.
- `electron/kb/research/{fetch,robots,guard,extract,dedupe,classify,generate,item,plan,budget,state,pipeline}.ts`: pipeline phases plan > search > fetch+extract > dedupe > generate > commit; checkpoint `run.json` + 7 d query / 14 d page / 24 h negative caches.
- `electron/kb/research/{service,wiring}.ts`: Run registration (`runner 'research'`, `mode 'job-research'`, jobId stamped), estimate/start/stop; wiring = real config/keys/job/helper model/store/network.
- `electron/kb/handlers.ts` (shared, smallest edit): `kbEstimate`, `kbResearchStart`, `kbResearchStop` real, lazily imported. `handlers.test.ts` / `stubs.test.ts`: only my rows removed/moved.
- `electron/kb/types.ts` (frozen file, lead-approved at the gate): `KbSummary.progress?: ResearchProgress | null`; `service.progress(jobId)` supplies it, WP1's `kbSummary` must merge it. `research/hash-parity.test.ts` pins the hash vectors and auto-compares kb/hash.ts once WP1 lands.
- `scripts/kb-research-dry.mjs` (offline by default, `--live` + `CL_LIVE_RESEARCH=1`), `docs/plans/job-knowledge-base/spikes/S-R1.md` ("not run: needs key" template).

**Decisions:**
- Everything external is injected (backends, fetch, LLM, store, state): the whole run is deterministic on fakes. Alternative: module mocks.
- Job id is a URL: KB folder = `sha1(jobId)[0:24]` (`kbJobDir` in wiring.ts); WP1's store must use the same name. `itemId`, `queryKey`, `pageKey`, `inputHashOf` are local copies of the hash.ts recipes (WP1 stubs throw): unify at integration.
- Generated cap = max(30 %, floor 6) so an all-generated first bank stays tiny and labelled. Page text is never persisted; only our wording + contentHash.
- Research LLM = `runText` helper tier (any runner). Each call shows as its own `job-view` run on the Runs page (limitation); an in-process OpenRouter path would avoid that.
- Consent: `consentVersion === null` refuses to start (UI to set it is WP3/WP6).

**Patterns:** evidence-span check, fence + `neutralize`, injection pages dropped whole, URLs only from search/fetch, per-hop redirect re-validation, 1 req/s/host, one Chrome at a time (queued CDP).

**State:** done (S-R1 open). **Next steps:** user runs S-R1 (`CL_LIVE_RESEARCH=1 node scripts/kb-research-dry.mjs --live --jobs ...`) and fills spikes/S-R1.md for G-R; WP1 store merge-by-id must keep items the pipeline passes through (user/pinned/hidden/edited); wire `cfg.research.model` override if wanted.
