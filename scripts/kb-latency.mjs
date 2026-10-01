// Retrieval latency harness (plan §6.1: p95 < 5 ms @ 400 items, hard ceiling 50 ms).
// Run from the repo root after `npm run build:electron`:  node scripts/kb-latency.mjs [--runs=300]
import { createRequire } from 'node:module'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

const require = createRequire(import.meta.url)
const { openKbStore } = require('../dist/electron/kb/store.js')
const { bindKbStore, retrieve, kbPrefix } = require('../dist/electron/kb/retrieve.js')
const { golden400, goldenSkills, labelled } = require('../dist/electron/kb/fixtures/golden.js')

const runs = Number(process.argv.find(a => a.startsWith('--runs='))?.slice(7) ?? 300)
const dir = mkdtempSync(join(tmpdir(), 'kb-latency-'))
const store = openKbStore(() => dir)
bindKbStore(store)
store.commit('bench', { items: golden400(), skills: goldenSkills() })
const queries = labelled().map(l => l.query)
const pct = (xs, p) => [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil((p / 100) * xs.length) - 1)]
const time = fn => { const t = process.hrtime.bigint(); fn(); return Number(process.hrtime.bigint() - t) / 1e6 }

retrieve('bench', queries[0]) // first call builds the index; reported separately
const cold = (() => { bindKbStore(store); return time(() => retrieve('bench', queries[0])) })()
const warm = Array.from({ length: runs }, (_, i) => time(() => retrieve('bench', queries[i % queries.length])))
const prefix = Array.from({ length: runs }, () => time(() => kbPrefix('bench')))
const row = (name, xs) => `${name.padEnd(12)} p50 ${pct(xs, 50).toFixed(3)} ms  p95 ${pct(xs, 95).toFixed(3)} ms  max ${Math.max(...xs).toFixed(3)} ms`
console.log(`items=400 runs=${runs}\nindex build + first query ${cold.toFixed(2)} ms\n${row('retrieve', warm)}\n${row('kbPrefix', prefix)}`)
rmSync(dir, { recursive: true, force: true })
const p95 = pct(warm, 95)
if (p95 >= 50) { console.error('FAIL: p95 over the 50 ms hard ceiling'); process.exit(1) }
if (p95 >= 5) console.warn('WARN: p95 over the 5 ms target')
