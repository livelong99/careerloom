import { createHash } from 'node:crypto'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { readReport } from '../careerops'
import { broadcast, dataRoot, Handler, readSettings, str, userFile, writeSettings } from '../context'
import { isModelId, isRunner } from '../runner'
import { listJobs } from '../jobs'
import { prefetchJd } from '../jobs-batch'
import { runText } from './agent'
import { cachedPosting, deterministicPosting, structurePosting } from './jdStructure'
import { parseReport } from './reportParse'
import type { JobView, ReportView } from './types'
import type { JobListing } from '../contract'

const dir = () => userFile('job-views')
const h = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24)
const jdFile = (id: string) => join(dir(), 'jd', `${h(id)}.txt`)
const inflight = new Map<string, Promise<void>>()
/** Jobs whose model pass failed this session: shown as deterministic, not retried until restart or Re-tidy. */
const failed = new Set<string>()

const readJd = (id: string): string | null => { try { return readFileSync(jdFile(id), 'utf8') } catch { return null } }
function readRaw(job: JobListing): string | null {
  if (!job.reportPath) return null
  try { return readReport(dataRoot(), job.reportPath) } catch { return null }
}
const loadReport = (job: JobListing): ReportView | null => { const raw = readRaw(job); return raw === null ? null : parseReport(raw) }
const metaOf = (job: JobListing) => ({ title: job.title || null, company: job.company || null, location: job.location })

/** Everything the page can show right now; never waits on the network or the model. */
function snapshot(job: JobListing): JobView & { pending: boolean } {
  const report = loadReport(job)
  const prefetched = report?.jd ? null : readJd(job.id)
  const jd = report?.jd ?? prefetched
  const meta = metaOf(job)
  const hit = jd ? cachedPosting(jd, meta, join(dir(), 'posting')) : null
  const posting = hit?.posting ?? (jd ? deterministicPosting(jd, meta) : null)
  const source = report?.jd ? 'report' : prefetched ? 'prefetch' : 'none'
  const view: JobView = { id: job.id, report, posting, rawJd: jd, rawReport: readRaw(job), meta: { source, filled: hit?.meta.filled ?? 'deterministic', model: hit?.meta.model ?? null, tokens: hit?.meta.tokens ?? null, cachedAt: Date.now() } }
  return { ...view, pending: !hit && !failed.has(job.id) && (jd !== null || inflight.has(job.id) || !job.reportPath) }
}

/** JD (archive, else prefetch once) -> structured posting; one per job at a time. */
function ensure(job: JobListing): void {
  if (inflight.has(job.id)) return
  const run = (async () => {
    let jd = loadReport(job)?.jd ?? readJd(job.id)
    if (!jd && /^https?:\/\//i.test(job.url)) {
      jd = await prefetchJd(job.url)
      if (jd) { mkdirSync(join(dir(), 'jd'), { recursive: true }); writeFileSync(jdFile(job.id), jd) }
    }
    if (jd) {
      const r = await structurePosting(jd, metaOf(job), { run: p => runText(p, { tier: 'helper', label: 'Structure job posting' }), cacheDir: join(dir(), 'posting'), now: Date.now })
      if (r.meta.filled === 'model-failed') failed.add(job.id)
    } else failed.add(job.id)
  })().catch(err => console.error('job view structuring failed:', err)).finally(() => { inflight.delete(job.id); broadcast('careerloom:jobView', { id: job.id }) })
  inflight.set(job.id, run)
}

const find = (raw: unknown): JobListing => {
  const id = str(raw, 'job id')
  const job = listJobs().find(j => j.id === id)
  if (!job) throw new Error('That job is no longer in your list')
  return job
}

export const jobViewHandlers: Record<string, Handler> = {
  jobView: raw => {
    const job = find(raw)
    const v = snapshot(job)
    if (v.pending) ensure(job)
    return { ...v, pending: v.pending || inflight.has(job.id) }
  },
  setHelperModel: (runner: unknown, model: unknown) => {
    if (!isRunner(runner) || runner === 'api') throw new Error('Pick an agent runner')
    if (model !== null && !isModelId(model)) throw new Error('Model ids are letters, digits and . _ : / @ - (up to 100 characters)')
    const next = { ...readSettings().helperModels }
    if (model === null || model === '') delete next[runner]
    else next[runner] = model
    return writeSettings({ helperModels: next })
  },
}
