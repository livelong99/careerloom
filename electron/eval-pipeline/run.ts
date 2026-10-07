// Orchestrator: stages 0-4 as pure steps over typed inputs, with a checkpoint per stage in the run folder
// (resumable), bounded concurrency, cancellation and per-stage metrics + cost. Stage 3 also checkpoints per verdict.
import fs from 'node:fs'
import path from 'node:path'

import { extractSkills } from '../ats/skills'
import { createCostMeter, type CostMeter } from '../copilot/cost'
import { fileCache, jdHash, stage0 } from './stage0-fetch'
import { stage1, titleGate, type FilterRules } from './stage1-filter'
import { stage2 } from './stage2-score'
import { selectDeep, stage3 } from './stage3-batch'
import { stage4, type WriteDeps } from './stage4-write'
import { DEFAULT_CONFIG, type Candidate, type EvalJob, type FetchedJob, type JobResult, type Light, type LlmCall, type PipelineConfig, type PipelineResult, type StageId, type StageMetric } from './types'
import { readJson, sha, writeJson } from './util'

export type PipelineDeps = {
  runId: string
  /** Folder for checkpoints, JD store and the verdict cache's sibling files. */
  runDir: string
  /** Persistent verdict cache (survives runs); defaults to runDir/../eval-cache.json. */
  cacheFile?: string
  candidate: Candidate
  rules?: FilterRules
  fetchJd: (job: EvalJob) => Promise<string>
  llm: LlmCall
  /** null = dry run: no files written beyond the run folder. */
  write: WriteDeps | null
  config?: Partial<PipelineConfig>
  signal?: AbortSignal
  meter?: CostMeter
  onStage?: (m: StageMetric) => void
}

type S0 = { settled: JobResult[]; fetchedIds: string[]; metric: StageMetric }
type S1 = { settled: JobResult[]; passIds: string[]; metric: StageMetric }
type S2 = { settled: JobResult[]; pass: Array<{ id: string; local: number }>; metric: StageMetric }
type S3 = { settled: JobResult[]; metric: StageMetric }

const metric = (stage: StageId, inCount: number, outCount: number, ms: number, extra: Partial<StageMetric> = {}): StageMetric => ({ stage, inCount, outCount, ms: Math.round(ms), inputTokens: 0, outputTokens: 0, usd: 0, errors: 0, ...extra })

export async function runPipeline(jobs: EvalJob[], deps: PipelineDeps): Promise<PipelineResult> {
  const cfg = { ...DEFAULT_CONFIG, ...deps.config }
  const { runDir, signal, candidate: c } = deps
  fs.mkdirSync(path.join(runDir, 'jd'), { recursive: true })
  const meter = deps.meter ?? createCostMeter()
  const metrics: StageMetric[] = []
  const results = new Map<string, JobResult>()
  const take = (rs: JobResult[]) => rs.forEach(r => results.set(r.jobId, r))
  const done = (m: StageMetric) => { metrics.push(m); deps.onStage?.(m) }
  const cancelled = () => !!signal?.aborted
  const byId = new Map(jobs.map(j => [j.id, j]))
  const cache = fileCache(deps.cacheFile ?? path.join(path.dirname(runDir), 'eval-cache.json'))
  const jdStore = {
    get: (url: string) => { try { return fs.readFileSync(path.join(runDir, 'jd', `${sha(url)}.txt`), 'utf8') } catch { return undefined } },
    set: (url: string, jd: string) => fs.writeFileSync(path.join(runDir, 'jd', `${sha(url)}.txt`), jd),
  }
  const fetchedOf = (id: string): FetchedJob => { const j = byId.get(id)!; const jd = jdStore.get(j.url) ?? ''; return { ...j, jd, jdHash: jdHash(jd, j.location) } }
  const finish = (): PipelineResult => ({ runId: deps.runId, results: [...results.values()], metrics, totalUsd: meter.totalUsd(), cancelled: cancelled() })
  writeJson(path.join(runDir, 'meta.json'), { runId: deps.runId, jobIds: jobs.map(j => j.id), startedAt: new Date().toISOString(), config: cfg })

  // Stage 0 — fetch, dedupe, cache
  let s0 = readJson<S0>(path.join(runDir, 's0.json'))
  if (!s0) {
    const t = performance.now()
    const o = await stage0(jobs, { gate: j => titleGate(j, c), fetchJd: deps.fetchJd, cache, profileKey: c.profileKey, concurrency: cfg.fetchConcurrency, signal, jdStore })
    s0 = { settled: o.settled, fetchedIds: o.fetched.map(j => j.id), metric: metric('fetch', jobs.length - o.settled.filter(r => r.stage === 'filter').length, o.fetched.length, performance.now() - t, { errors: o.errors }) }
    if (cancelled()) return finish()
    writeJson(path.join(runDir, 's0.json'), s0)
  }
  take(s0.settled); done(s0.metric)
  const fetched = s0.fetchedIds.map(fetchedOf)
  const pregated = s0.settled.filter(r => r.stage === 'filter').length // stage 1 also counts the jobs its title gates kept from being fetched

  // Stage 1 — deterministic gates
  let s1 = readJson<S1>(path.join(runDir, 's1.json'))
  if (!s1) {
    const t = performance.now()
    const o = stage1(fetched, c, deps.rules)
    s1 = { settled: o.settled, passIds: o.pass.map(j => j.id), metric: metric('filter', fetched.length + pregated, o.pass.length, performance.now() - t) }
    writeJson(path.join(runDir, 's1.json'), s1)
  }
  take(s1.settled); done(s1.metric)

  // Stage 2 — local score
  let s2 = readJson<S2>(path.join(runDir, 's2.json'))
  if (!s2) {
    const t = performance.now()
    const o = stage2(s1.passIds.map(fetchedOf), c, cfg.skipBelow)
    s2 = { settled: o.settled, pass: o.pass.map(j => ({ id: j.id, local: j.local.score })), metric: metric('score', s1.passIds.length, o.pass.length, performance.now() - t) }
    writeJson(path.join(runDir, 's2.json'), s2)
  }
  take(s2.settled); done(s2.metric)
  const scored = s2.pass.map(p => ({ ...fetchedOf(p.id), local: { score: p.local } }))

  // Stage 3 — batched model verdicts (checkpointed per verdict)
  let s3 = readJson<S3>(path.join(runDir, 's3.json'))
  if (!s3) {
    const t = performance.now()
    const log = path.join(runDir, 's3.jsonl')
    const prior = new Map<string, Light>()
    try { for (const line of fs.readFileSync(log, 'utf8').split('\n')) if (line) { const r = JSON.parse(line) as { id: string; v: Light }; prior.set(r.id, r.v) } } catch { /* first run */ }
    const o = await stage3(scored, c, [...extractSkills(c.cv.markdown)], deps.llm, cfg, { cache, signal, meter, done: prior, onVerdict: (id, v) => fs.appendFileSync(log, JSON.stringify({ id, v }) + '\n') })
    s3 = { settled: o.settled, metric: metric('llm', scored.length, o.settled.filter(r => r.fate !== 'failed').length, performance.now() - t, { inputTokens: o.inputTokens, outputTokens: o.outputTokens, usd: o.usd, errors: o.errors }) }
    if (cancelled()) { take(s3.settled); return finish() }
    writeJson(path.join(runDir, 's3.json'), s3)
  }
  take(s3.settled); done(s3.metric)
  take(selectDeep([...results.values()], cfg)) // cached verdicts compete for the deep slots too

  // Stage 4 — deterministic writer (light verdicts only; 'deep' ones are written by the full agent)
  if (deps.write && !cancelled()) {
    const t = performance.now()
    const s4Log = path.join(runDir, 's4.jsonl') // one id per written job, appended as it lands: a crash mid-write never duplicates reports
    const already = new Set<string>(readJson<{ ids: string[] }>(path.join(runDir, 's4.json'))?.ids ?? [])
    try { for (const id of fs.readFileSync(s4Log, 'utf8').split('\n')) if (id) already.add(JSON.parse(id) as string) } catch { /* first run */ }
    const items = [...results.values()].filter(r => r.fate === 'light' && r.light && !already.has(r.jobId)).map(r => ({ job: fetchedOf(r.jobId), result: r }))
    const o = await stage4(items, { ...deps.write, resumed: already.size > 0, onWritten: id => fs.appendFileSync(s4Log, JSON.stringify(id) + '\n') })
    take(o.failed)
    done(metric('write', items.length, o.written.length, performance.now() - t, { errors: o.errors, note: o.finalizeError && `merge-tracker/reconcile failed (${o.finalizeError}); the reports are written and the next merge picks them up` }))
  }
  return finish()
}
