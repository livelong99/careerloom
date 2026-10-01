---
name: 20261001-copilot-perf1
description: Copilot PERF-1: per-turn latency trace, prefix-stable/headline-first prompt, reasoning-param fix, pre-warm, cached-token cost model + report
type: project
---

**Task:** PERF-1 instrumentation + engine critical path + cost
**Branch:** livelong99/perf-1-trace-prompt
**Date:** 2026-10-01

**Files changed:**
- `electron/copilot/trace.ts` (new): stage marks -> ms deltas, ring buffer, numbers-only JSONL sink, p50/p95 summary
- `electron/copilot/engine.ts`: trace marks (first byte/token/visible say/done), cached-token billing, sessionId, tighter maxTokens (320/420/800), window 800 tok/6 lines, `warm()`
- `electron/copilot/prompts.ts`: headline-first SAY (<=15 words), per-turn parts last
- `electron/copilot/providers/{openrouter,reasoning}.ts`: reasoning shape per model with 400 ladder (omit -> minimal -> low -> disabled, learned per model), cache_control for anthropic+qwen, `session_id`, cached_tokens, `warm()` (GET /key)
- `electron/copilot/{cost.ts,prices.json}`: `cachedUsdPerM`, `interviewUsd`; Settings tier pills use it
- `live-wiring.ts`, `defaults.ts`, `privacy-calls.ts`, `handlers.ts`, `types.ts`: warm at arm + 20 s keep-alive, speech-end/STT-final/detector marks, `latency.jsonl`, `SessionDetail.latency`, additive `Suggestion.trace`
- `renderer/overlay/buildData.ts`, `TierCards.tsx`, `Engine.tsx`: overlay shows time to first visible line; pills cache-aware
- `scripts/copilot-latency.mjs` (fake default, `--live`), `copilot-fake-sse.mjs`, `copilot-cost-report.mjs`; `docs/plans/interview-copilot/perf/cost-report.md`

**Decisions made:**
- Reasoning: no model list metadata for `mandatory`, so family guess + retry ladder. Alternatives: read `supported_parameters` (adds contract field).
- Warm-up = tokenless GET /key; periodic because Node idles keep-alive sockets out (unverified timeout length).

**State:** done. Fake-server numbers are synthetic; live numbers need the user's key (`--live --max-usd`).

**Next steps:**
- Run `OPENROUTER_API_KEY=... node scripts/copilot-latency.mjs --live` and replace estimates in cost-report.md with measured cache-hit rate.
- Debrief UI line for `SessionDetail.latency` (data only today).
