// Evaluation throughput benchmark: legacy one-agent-per-job vs the staged pipeline, on N synthetic jobs.
//   npx vite-node scripts/eval-bench.ts -- --n 1000 --history ~/path/runs.jsonl --runner opencode
// "Before" comes from real run history (evaluate runs: seconds and tokens per job). "After" runs the real pipeline code
// against a fake model that sees the real prompts, so token counts are real prompt sizes; wall-clock for the model is
// modelled (--latency ms per request + output tokens / --tps). Nothing here calls a real model.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { createCostMeter, defaultPrices } from '../electron/copilot/cost'
import { candidate, fakeFetch, fakeLlm, synthJobs } from '../electron/eval-pipeline/fakes'
import { agreement } from '../electron/eval-pipeline/quality'
import { runPipeline } from '../electron/eval-pipeline/run'

const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1]! : d }
const N = Number(arg('n', '1000'))
const LATENCY = Number(arg('latency', '4000')) // ms per model request
const TPS = Number(arg('tps', '80')) // output tokens / s
const FETCH_MS = Number(arg('fetch-ms', '800'))
const MODEL = arg('model', 'google/gemini-2.5-flash-lite')
const runner = arg('runner', 'opencode')
const med = (xs: number[]) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)]! : 0 }

type Run = { runner: string; mode: string; status: string; startedAt: string | number; endedAt: string | number; usage?: { inputTokens: number; outputTokens: number } | null }
function legacy(): { sec: number; inTok: number; outTok: number; n: number; source: string } {
  const file = arg('history', '')
  const runs = file && fs.existsSync(file) ? fs.readFileSync(file, 'utf8').split('\n').filter(Boolean).flatMap(l => { try { return [JSON.parse(l) as Run] } catch { return [] } }) : []
  const ok = runs.filter(r => r.mode === 'evaluate' && r.status === 'done' && r.runner === runner && r.usage)
  if (!ok.length) return { sec: 255, inTok: 2_900_000, outTok: 59_000, n: 0, source: 'built-in constants (antigravity runs, 2026-09)' }
  return { sec: med(ok.map(r => (new Date(r.endedAt).getTime() - new Date(r.startedAt).getTime()) / 1000)), inTok: med(ok.map(r => r.usage!.inputTokens)), outTok: med(ok.map(r => r.usage!.outputTokens)), n: ok.length, source: `${path.basename(file)} · ${ok.length} done "${runner}" evaluate runs (median)` }
}

const world = synthJobs(N, 42)
const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-bench-'))
const llm = fakeLlm(world, { noise: 0.3, model: MODEL })
const meter = createCostMeter()
let nextNum = 0
const t0 = performance.now()
const out = await runPipeline(world, { runId: 'bench', runDir: path.join(base, 'runs', 'bench'), candidate: candidate(), fetchJd: fakeFetch(world), llm, meter, write: { root: path.join(base, 'career-ops'), date: '2026-10-07', runId: 'bench', reserve: async n => Array.from({ length: n }, () => String(++nextNum).padStart(3, '0')) }, config: { model: MODEL } })
const codeSec = (performance.now() - t0) / 1000
const m = Object.fromEntries(out.metrics.map(x => [x.stage, x]))
const llmM = m.llm!
const calls = llm.calls
const modelSec = (calls * LATENCY / 1000 + llmM.outputTokens / TPS) / 3 // llmConcurrency 3
const fetchSec = (m.fetch!.inCount * FETCH_MS / 1000) / 8
const wall = codeSec + modelSec + fetchSec

const L = legacy()
const legacyPrice = (defaultPrices.models[MODEL]!.promptUsdPerM * L.inTok + defaultPrices.models[MODEL]!.completionUsdPerM * L.outTok) / 1e6
const deep = out.results.filter(r => r.fate === 'deep').length
const light = out.results.filter(r => r.fate === 'light').length
const afterIn = llmM.inputTokens + 0, afterOut = llmM.outputTokens
const deepIn = deep * L.inTok, deepOut = deep * L.outTok
const uniq = new Map(out.results.map(r => [r.jobId, r]))
const labels = world.filter(j => uniq.get(j.id)?.dupOf === undefined).map(j => ({ jobId: j.id, ref: j.truth }))
const q = agreement(out.results, labels)
const f = (n: number, d = 1) => n.toFixed(d)
const legacySec = N * L.sec

console.log(`# Eval pipeline benchmark — ${N} synthetic jobs\n`)
console.log(`Legacy baseline: ${L.source}: ${f(L.sec, 0)} s, ${Math.round(L.inTok / 1000)}k in / ${Math.round(L.outTok / 1000)}k out tokens per job, strictly sequential.\n`)
console.log('| Stage | in | out | ms | in tok | out tok | errors |\n|---|---:|---:|---:|---:|---:|---:|')
for (const s of out.metrics) console.log(`| ${s.stage} | ${s.inCount} | ${s.outCount} | ${s.ms} | ${s.inputTokens} | ${s.outputTokens} | ${s.errors} |`)
console.log(`\nFate: ${light} light verdicts, ${deep} escalated to the full agent, ${out.results.filter(r => r.fate === 'skip').length} skipped, ${out.results.filter(r => r.fate === 'failed').length} failed. Model calls: ${calls} (${f(llmM.inCount / Math.max(calls, 1))} judged jobs/call; ${Math.round((llmM.inputTokens + llmM.outputTokens) / Math.max(llmM.inCount, 1))} tokens per judged job).\n`)
console.log('| | Before (per-job agent) | After (staged, light only) | After incl. escalations |\n|---|---:|---:|---:|')
console.log(`| wall-clock for ${N} jobs | ${f(legacySec / 3600)} h | ${f(wall / 60)} min | ${f((wall + deep * L.sec) / 60)} min |`)
console.log(`| jobs/min | ${f(60 / L.sec, 2)} | ${f(N / (wall / 60))} | ${f(N / ((wall + deep * L.sec) / 60), 1)} |`)
console.log(`| input tokens/job | ${Math.round(L.inTok)} | ${Math.round(afterIn / N)} | ${Math.round((afterIn + deepIn) / N)} |`)
console.log(`| output tokens/job | ${Math.round(L.outTok)} | ${Math.round(afterOut / N)} | ${Math.round((afterOut + deepOut) / N)} |`)
console.log(`| cost/job @ ${MODEL} | $${f(legacyPrice, 3)} | $${f(meter.totalUsd() / N, 6)} | $${f((meter.totalUsd() + deep * legacyPrice) / N, 4)} |`)
console.log(`\nCode-only wall (measured): ${f(codeSec, 2)} s for ${N} jobs = ${f(N / codeSec, 0)} jobs/s excluding fetch and model. Modelled: fetch ${f(fetchSec)} s (${FETCH_MS} ms × ${m.fetch!.inCount} / 8), model ${f(modelSec)} s (${LATENCY} ms + out/${TPS} tps, 3 in flight).`)
console.log(`\nQuality vs ground truth (${q.n} unique jobs): agreement ${f(q.agreement * 100)}%, kappa ${q.kappa}, missed ${f(q.missedRate * 100)}% of positives, false alarms ${f(q.falseAlarmRate * 100)}%, ${q.droppedEarly} positives dropped before the model, fit MAE ${q.maeFit}.`)
fs.rmSync(base, { recursive: true, force: true })
