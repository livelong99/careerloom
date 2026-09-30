---
name: 20261001-copilot-wp2
description: Interview Copilot WP2 engine: OpenRouter SSE provider, detector, grounding context, prompts/parser, guard, failover, cost, redact, model list/test; live latency table pending a key
type: project
---

**Task:** Copilot WP2 (plan.md §3.3–3.4, §11). **Branch:** livelong99/copilot-wp2-engine. **Date:** 2026-10-01

**Files (all `electron/copilot/` unless noted):**
- `providers/openrouter.ts`: SSE parser (skips `: OPENROUTER PROCESSING`, CRLF, byte-split safe), mid-stream `error` events, usage chunk, typed `LlmError` codes, AbortController + first-byte/idle timeouts, `cache_control` only for `anthropic/*`, `data_collection:'deny'`, `fetchModels`.
- `engine.ts`: `createAnswerEngine` (latest request wins, throttled partials, tier/escalation, failover, cost ceiling, redaction), `createLlmClassifier`; `AnswerProvider` extended with `maxTokens`/`costUsd`.
- `detector.ts` (+ `fixtures/detector-*.json`), `context.ts`, `prompts.ts` (rules + injection fence + section parser), `guard.ts` (proof substring + factCheck flags), `failover.ts`, `cost.ts`/`prices.json`, `redact.ts`, `models.ts` + `live.ts` (handlers `copilotListLlmModels`/`copilotTestLlmModel`; handlers.ts edit = 2 entries), `recommended-models.json`.
- `scripts/copilot-latency.mjs`, `fixtures/harness-{cv.md,questions.json}`.

**Decisions:** failover rotates models (one key) on retryable codes only, never after output started. Grounding = rules+facts in system (cacheable), per-request text in the user message. Proof quotes are whitespace-collapsed substrings, min 8 chars. `reasoning:{enabled:false}` sent for latency. Detector: ambiguous = not a question unless a classifier is wired (fails closed).

**Detector numbers (rules only, no LLM):** main fixture (67 lines) P 1.00 / R 1.00 but rules were written alongside it (overfit risk). Held-out set (30 lines, written after freeze): first run P 0.91 / R 0.67; after adding `name a…`, `talk to me`, comma-clause wh+aux rules and a `weather` small-talk rule: P 1.00 / R 0.93 (no longer clean held-out). LLM-classify P/R not measured (needs key).

**State:** done except live latency. **Live run (no key was available; lead said skip):**
`npm run build:electron && OPENROUTER_API_KEY=<key> node scripts/copilot-latency.mjs --models google/gemini-2.5-flash-lite,openai/gpt-4.1-nano,anthropic/claude-haiku-4.5 --runs 12 --max-usd 2 [--detector]`; writes JSON to `docs/plans/interview-copilot/measurements/`. Harness was verified only against a local fake SSE server (`--base-url`). Bundled grounding in the harness is ~540 tokens, far below the plan's 5,000; TTFT with a real-size prefix/cache is untested.
Model ids/prices verified against OpenRouter `/api/v1/models` on 2026-10-01. Defaults (unmeasured): fast `google/gemini-2.5-flash-lite`, balanced `anthropic/claude-haiku-4.5`… first entry per tier in `recommended-models.json` until G-C numbers exist.

**Next steps:** run the harness with a user key and pick tier defaults; wire `createAnswerEngine` + `createContextBuilder(defaultContextDeps())` + `createDetector` into `session.ts` (WP3/WP4); `copilotContextPreview` handler is not wired (WP4 owns handlers).
