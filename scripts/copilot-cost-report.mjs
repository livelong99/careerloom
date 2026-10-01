#!/usr/bin/env node
// Per-interview cost table (PERF-1) from the bundled dated price table via the app's own cost function.
//   npm run build:electron && node scripts/copilot-cost-report.mjs > docs/plans/interview-copilot/perf/cost-report.md
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
const require = createRequire(import.meta.url)
const dist = join(resolve(dirname(fileURLToPath(import.meta.url)), '..'), 'dist/electron/copilot')
const { defaultPrices, interviewUsd, DEFAULT_INTERVIEW: S } = require(join(dist, 'cost.js'))
const rec = require(join(dist, 'recommended-models.json'))

const usd = v => (v === null ? 'n/a' : `$${v < 0.01 ? v.toFixed(4) : v.toFixed(3)}`)
const FP = [0, 0.1, 0.25, 0.5]
const out = []
out.push('# Copilot cost per interview (PERF-1)', '')
out.push(`Prices: \`prices.json\`, dated ${defaultPrices.asOf}. Cached-read rates are prompt price x the multiplier in OpenRouter's prompt-caching docs (Anthropic/Qwen 0.1x, Gemini 0.25x, OpenAI 0.25-0.5x); for gpt-4.1 (0.25x) and gpt-5/6 (0.1x / 0.25x) the multiplier is an assumption. **Estimates, not measurements**: no live key was available. Provider-billed cost (\`usage.cost\`) overrides them at runtime.`, '')
out.push(`Interview shape (plan s.10): ${S.answers} answers in ~45 min, each ${S.prefixTokens} stable-prefix tokens + ${S.freshTokens} fresh input tokens + ${S.outTokens} output tokens. "Cached" = 90% of calls after the first read the prefix from cache (first call is cold; Anthropic's 1.25x cache-write surcharge is not modelled, add ~$0.00001-0.0003). Auto-ask false positive rate f adds calls: calls = answers / (1 - f). Target: <= $0.30 per interview.`, '')
out.push('| tier | model | no cache | cached | cached, auto-ask FP 10% | cached, FP 25% | cached, FP 50% | uncached, FP 50% |', '|---|---|---|---|---|---|---|---|')
for (const [tier, list] of Object.entries(rec.tiers)) for (const m of list) {
  const c = (hit, fp) => usd(interviewUsd(defaultPrices, m.id, { cacheHitRate: hit, autoFalsePositive: fp }))
  out.push(`| ${tier} | \`${m.id}\` | ${c(0, 0)} | ${c(0.9, 0)} | ${c(0.9, 0.1)} | ${c(0.9, 0.25)} | ${c(0.9, 0.5)} | ${c(0, 0.5)} |`)
}
console.log(out.join('\n'))
