#!/usr/bin/env node
// Jev gate probe (PERF-2): round-trip time p50/p95 and verdicts for the optional decision-model gate, per endpoint shape and host.
//   npm run build:electron && OPENROUTER_API_KEY=... node scripts/copilot-gate-probe.mjs --live --runs 20 --max-usd 0.05
//   add TYPESAFE_API_KEY=... to also probe the direct host (https://api.typesafe.ai, systemone only)
// Without --live nothing is sent. Dev-only: the app reads its key from safeStorage. Never run in CI.
// Cost is estimated ($0.042 per 1M input tokens, output free; ~500 input tokens per call) and --max-usd stops the run.
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist/electron')
const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, all) => (a.startsWith('--') ? [[a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? 'true' : all[i + 1]]] : [])))
if (args.live !== 'true') { console.error('Dry run: pass --live to send requests (needs OPENROUTER_API_KEY).'); process.exit(0) }
const orKey = process.env.OPENROUTER_API_KEY, tsKey = process.env.TYPESAFE_API_KEY
if (!orKey) { console.error('Set OPENROUTER_API_KEY.'); process.exit(2) }
const runs = Number(args.runs ?? 20), maxUsd = Number(args['max-usd'] ?? 0.05)
const PER_CALL_USD = (500 * 0.042) / 1e6

const { createJevGate } = require(join(dist, 'copilot/gate/jev.js'))
const items = JSON.parse(readFileSync(join(root, 'electron/copilot/fixtures/detector-utterances.json'), 'utf8')).items
const variants = [
  { name: 'openrouter /v1/systemone', baseUrl: args['base-url'] ?? 'https://openrouter.ai/api', endpoint: 'systemone', key: orKey },
  { name: 'openrouter /alpha/decisions', baseUrl: args['base-url'] ?? 'https://openrouter.ai/api', endpoint: 'decisions', key: orKey },
  ...(tsKey ? [{ name: 'typesafe direct /v1/systemone', baseUrl: 'https://api.typesafe.ai', endpoint: 'systemone', key: tsKey }] : []),
]
const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(p * xs.length) - 1)] : null)

let spent = 0
const rows = []
for (const v of variants) {
  const gate = createJevGate({ baseUrl: v.baseUrl, endpoint: v.endpoint, getKey: () => v.key })
  const rtt = [], errors = []
  let agree = 0, scored = 0
  for (let i = 0; i < runs && spent < maxUsd; i++) {
    const it = items[i % items.length]
    const t0 = performance.now()
    try {
      const verdict = await gate.decide({ text: it.text, speaker: 'interviewer' }, AbortSignal.timeout(5000))
      rtt.push(performance.now() - t0); spent += PER_CALL_USD
      if (verdict.isQuestion !== null) { scored++; if (verdict.isQuestion === (it.label === 'q')) agree++ }
    } catch (e) { errors.push(String(e.message).slice(0, 80)) }
  }
  rows.push({ variant: v.name, calls: rtt.length, rttP50: pct(rtt, 0.5), rttP95: pct(rtt, 0.95), agreeWithLabels: scored ? agree / scored : null, errors: [...new Set(errors)] })
}
console.log('| variant | calls | RTT p50 | RTT p95 | agrees with fixture labels | errors |\n|---|---|---|---|---|---|')
for (const r of rows) console.log(`| ${r.variant} | ${r.calls} | ${r.rttP50?.toFixed(0)} ms | ${r.rttP95?.toFixed(0)} ms | ${r.agreeWithLabels === null ? 'n/a' : (r.agreeWithLabels * 100).toFixed(0) + '%'} | ${r.errors.join('; ') || '-'} |`)
console.error(`estimated spend $${spent.toFixed(5)} (cap $${maxUsd})`)
