# Copilot cost per interview (PERF-1)

Prices: `prices.json`, dated 2026-10-01. Cached-read rates are prompt price x the multiplier in OpenRouter's prompt-caching docs (Anthropic/Qwen 0.1x, Gemini 0.25x, OpenAI 0.25-0.5x); for gpt-4.1 (0.25x) and gpt-5/6 (0.1x / 0.25x) the multiplier is an assumption. **Estimates, not measurements**: no live key was available. Provider-billed cost (`usage.cost`) overrides them at runtime.

Interview shape (plan s.10): 15 answers in ~45 min, each 5000 stable-prefix tokens + 800 fresh input tokens + 300 output tokens. "Cached" = 90% of calls after the first read the prefix from cache (first call is cold; Anthropic's 1.25x cache-write surcharge is not modelled, add ~$0.00001-0.0003). Auto-ask false positive rate f adds calls: calls = answers / (1 - f). Target: <= $0.30 per interview.

| tier | model | no cache | cached | cached, auto-ask FP 10% | cached, FP 25% | cached, FP 50% | uncached, FP 50% |
|---|---|---|---|---|---|---|---|
| fast | `openai/gpt-4.1-nano` | $0.010 | $0.0058 | $0.0064 | $0.0076 | $0.011 | $0.021 |
| fast | `openai/gpt-6-luna` | $0.011 | $0.0062 | $0.0069 | $0.0082 | $0.012 | $0.022 |
| fast | `qwen/qwen3-30b-a3b-instruct-2507` | $0.0051 | $0.0023 | $0.0026 | $0.0030 | $0.0045 | $0.010 |
| balanced | `anthropic/claude-haiku-4.5` | $0.110 | $0.053 | $0.058 | $0.069 | $0.102 | $0.219 |
| balanced | `openai/gpt-4.1-mini` | $0.042 | $0.023 | $0.026 | $0.030 | $0.045 | $0.084 |
| balanced | `google/gemini-3.6-flash` | $0.082 | $0.047 | $0.052 | $0.061 | $0.091 | $0.164 |
| balanced | `openai/gpt-5.4-mini` | $0.086 | $0.043 | $0.047 | $0.056 | $0.083 | $0.171 |
| deep | `anthropic/claude-sonnet-5.5` | $0.219 | $0.106 | $0.116 | $0.138 | $0.203 | $0.438 |
| deep | `openai/gpt-6.1-sol` | $0.219 | $0.125 | $0.138 | $0.164 | $0.242 | $0.438 |
| deep | `google/gemini-3.1-pro-preview` | $0.228 | $0.133 | $0.148 | $0.176 | $0.260 | $0.456 |

## Reading it
- Every cached configuration of fast/balanced is far below the $0.30 target. Deep misses it only uncached with a 50% auto-ask false-positive rate (`$0.44-0.46`).
- Caching roughly halves cost on prompt-heavy tiers. It needs a stable prefix (system rules + persona + grounding, byte-identical across turns; covered by tests), >= 1024 tokens (OpenAI) or 1024-4096 (Anthropic/Gemini, model dependent), and sticky routing (we send a per-session `session_id`). Anthropic/Qwen need `cache_control`; OpenAI/Gemini 2.5+/DeepSeek cache implicitly. Source: openrouter.ai/docs/features/prompt-caching.
- Not modelled: reasoning tokens (billed as output; we request minimal reasoning, `openrouter.ai/docs/use-cases/reasoning-tokens`), STT (local, free), Anthropic cache-write surcharge, cache expiry between questions longer than the 5 min TTL (the real hit rate is in the session debrief: `latency.cacheHitRate`).
- Regenerate: `npm run build:electron && node scripts/copilot-cost-report.mjs > docs/plans/interview-copilot/perf/cost-report.md`.
