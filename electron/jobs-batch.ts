// Evaluate exactly the selected jobs with career-ops' own headless worker
// (batch/batch-prompt.md), orchestrated the way batch/batch-runner.sh does it —
// reserve a report number, prefetch the JD, run one worker per job, merge its
// tracker line, record batch-state and reconcile pipeline.md — but without the
// runner's --dangerously-skip-permissions and without touching other pending jobs.
import fs from 'node:fs'
import path from 'node:path'

import { parse as parseYaml } from 'yaml'

import { careerOpsRoot, dataRoot, runScript, startAgentPrompt, type RunRecord, type RunSummary } from './context'
import type { JobListing } from './contract'
import { assertPublicResolution, firecrawlReady, firecrawlScrape } from './integrations/firecrawl'
import { browserPageText } from './integrations/browser-fetch'
import { jsonLdPostings, postingText } from './integrations/web-board-core'
import { BROWSER_UA, htmlToText, publicUrl } from './zen-tools'

const WORK_DIR = ['batch', 'careerloom'] // under the career-ops checkout; agents read it from cwd
const JD_CAP = 60_000

const read = (file: string) => { try { return fs.readFileSync(file, 'utf8') } catch { return null } }

/** Why scores would be meaningless right now (template profile), or [] when ready. */
export function profileProblems(root: string, data: string): string[] {
  const problems: string[] = []
  if (!read(path.join(data, 'cv.md'))?.trim()) problems.push('cv.md is empty — add your résumé on the Resume screen')
  const profile = read(path.join(data, 'config', 'profile.yml'))
  const example = read(path.join(root, 'config', 'profile.example.yml'))
  if (!profile) problems.push('config/profile.yml is missing')
  else if (example) {
    const stale = exampleFields(profile, example)
    if (stale.length) problems.push(`config/profile.yml still has the example ${stale.join(', ')}`)
  }
  const custom = read(path.join(data, 'modes', '_profile.md'))
  const template = read(path.join(root, 'modes', '_profile.template.md'))
  if (!custom || (template && custom.trim() === template.trim())) problems.push('modes/_profile.md (target roles, location policy) is still the template')
  return problems
}

// Fields that steer scoring: an example value here makes every score wrong.
const SCORING_FIELDS: Array<[string, string]> = [['candidate', 'name'], ['location', 'location'], ['compensation', 'pay targets'], ['target_roles', 'target roles']]

/** Which scoring fields in profile.yml still equal config/profile.example.yml. */
export function exampleFields(profile: string, example: string): string[] {
  try {
    const p = parseYaml(profile) as Record<string, unknown> | null
    const e = parseYaml(example) as Record<string, unknown> | null
    const pick = (y: Record<string, unknown> | null, key: string) => key === 'candidate'
      ? (y?.candidate as { full_name?: unknown } | undefined)?.full_name
      : y?.[key]
    return SCORING_FIELDS
      .filter(([key]) => pick(p, key) !== undefined && JSON.stringify(pick(p, key)) === JSON.stringify(pick(e, key)))
      .map(([, label]) => label)
  } catch {
    return profile.trim() === example.trim() ? ['values'] : []
  }
}

/** The worker's final JSON summary (flat object with status + report_num), last one wins. */
export function parseWorkerResult(log: string): { status: string; score: number | null; report_num: string | null; error: string | null } | null {
  const found = [...log.matchAll(/\{[^{}]*"status"\s*:[^{}]*"report_num"[^{}]*\}/g)].pop()
  if (!found) return null
  try {
    const v = JSON.parse(found[0]) as Record<string, unknown>
    return {
      status: String(v.status ?? ''),
      score: typeof v.score === 'number' ? v.score : null,
      report_num: typeof v.report_num === 'string' ? v.report_num : null,
      error: typeof v.error === 'string' ? v.error : null,
    }
  } catch {
    return null
  }
}

/** Fill batch-prompt.md's placeholders (plain replace — no sed escaping pitfalls). */
export function workerPrompt(template: string, v: { url: string; jdFile: string; reportNum: string; date: string; id: string }): string {
  return template
    .replaceAll('{{URL}}', v.url)
    .replaceAll('{{JD_FILE}}', v.jdFile)
    .replaceAll('{{REPORT_NUM}}', v.reportNum)
    .replaceAll('{{DATE}}', v.date)
    .replaceAll('{{ID}}', v.id)
}

const tsvCell = (s: string) => s.replace(/[\t\r\n]+/g, ' ')

function appendBatchState(root: string, row: { id: string; url: string; status: string; startedAt: string; reportNum: string; score: number | null; error: string | null }): void {
  const file = path.join(root, 'batch', 'batch-state.tsv')
  if (!fs.existsSync(file)) fs.writeFileSync(file, 'id\turl\tstatus\tstarted_at\tcompleted_at\treport_num\tscore\terror\tretries\n')
  const cells = [row.id, row.url, row.status, row.startedAt, new Date().toISOString(), row.reportNum, row.score?.toFixed(1) ?? '-', row.error ?? '-', '0']
  fs.appendFileSync(file, cells.map(tsvCell).join('\t') + '\n')
}

/** The JD for the worker: Firecrawl when it's up, else the page's own JobPosting JSON-LD, else the page
 *  rendered in Chrome. An empty file makes the worker try WebFetch, which fails on script-rendered,
 *  bot-protected boards (Naukri, LinkedIn…). */
export async function prefetchJd(url: string): Promise<string> {
  if (await firecrawlReady()) {
    try {
      const page = await firecrawlScrape(url)
      if (page.markdown.trim().length > MIN_JD) return `Source: ${page.url}\n\n${page.markdown}`.slice(0, JD_CAP)
    } catch (err) { console.error('Firecrawl JD prefetch failed, trying the page directly:', err) }
  }
  try {
    const direct = await directJd(url)
    if (direct) return direct
  } catch (err) { console.error('Direct JD fetch failed, rendering it in Chrome:', err) }
  try {
    const target = publicUrl(url)
    await assertPublicResolution(target.hostname)
    const snapshot = await browserPageText(target.href)
    return snapshot.trim().length > MIN_JD ? `Source: ${url} (page rendered in Chrome)\n\n${snapshot}`.slice(0, JD_CAP) : ''
  } catch (err) { console.error('JD prefetch failed, worker will fetch it:', err); return '' }
}

const MIN_JD = 400

/** Plain fetch (public hosts only, redirects re-checked). Script-rendered boards still ship the
 *  posting as JSON-LD for search engines; markdown converters drop that script, so read it here. */
export async function directJd(raw: string): Promise<string> {
  let url = publicUrl(raw)
  for (let hop = 0; hop < 5; hop++) {
    await assertPublicResolution(url.hostname)
    const res = await fetch(url, { redirect: 'manual', headers: { 'user-agent': BROWSER_UA, accept: 'text/html,*/*' }, signal: AbortSignal.timeout(20_000) })
    const next = res.status >= 300 && res.status < 400 ? res.headers.get('location') : null
    if (next) { url = publicUrl(new URL(next, url).href); continue }
    if (!res.ok) throw new Error(`HTTP ${res.status} from ${url.hostname}`)
    const html = await res.text()
    const posting = jsonLdPostings(html)[0]
    const text = posting ? postingText(posting, htmlToText) : htmlToText(html)
    return text.trim().length > MIN_JD ? `Source: ${url.href}\n\n${text}`.slice(0, JD_CAP) : ''
  }
  throw new Error('too many redirects')
}

const TRACKER_HEADER = '# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-------|--------|-----|--------|-------|\n'

/** merge-tracker no-ops ("Nothing to merge into") on a fresh checkout — create the canonical tracker first. */
export function ensureTracker(data: string): void {
  if (fs.existsSync(path.join(data, 'data', 'applications.md')) || fs.existsSync(path.join(data, 'applications.md'))) return
  fs.mkdirSync(path.join(data, 'data'), { recursive: true })
  fs.writeFileSync(path.join(data, 'data', 'applications.md'), TRACKER_HEADER, { flag: 'wx' })
}

/** Merge worker results into the tracker (also picks up results stranded by an earlier failed merge). */
async function mergeTracker(): Promise<void> {
  ensureTracker(dataRoot())
  const res = await runScript(['merge-tracker.mjs'])
  if (res.code !== 0) console.error('merge-tracker failed:', res.stderr.split('\n')[0])
}

/** One worker run for `job`; resolves when it has been launched. `next` fires after it ends. */
async function launchWorker(job: JobListing, index: number, total: number, env: NodeJS.ProcessEnv, next: (run: RunRecord) => void): Promise<RunSummary> {
  const root = careerOpsRoot()
  const reserved = await runScript(['reserve-report-num.mjs'])
  const reportNum = reserved.stdout.trim()
  if (reserved.code !== 0 || !/^\d{1,5}$/.test(reportNum)) throw new Error(`Couldn't reserve a report number: ${reserved.stderr.split('\n')[0] || reserved.stdout}`)
  const id = `cl${Date.now().toString(36)}${index}`
  const dir = path.join(root, ...WORK_DIR)
  fs.mkdirSync(dir, { recursive: true })
  const jdFile = path.join(dir, `${id}.jd.md`)
  const promptFile = path.join(dir, `${id}.worker.md`)
  fs.writeFileSync(jdFile, await prefetchJd(job.url))
  const template = read(path.join(root, 'batch', 'batch-prompt.md'))
  if (!template) throw new Error('batch/batch-prompt.md is missing from career-ops — update or repair it in Integrations')
  const date = new Date().toISOString().slice(0, 10)
  fs.writeFileSync(promptFile, workerPrompt(template, { url: job.url, jdFile: path.relative(root, jdFile), reportNum, date, id }))
  const startedAt = new Date().toISOString()
  const release = () => runScript(['reserve-report-num.mjs', '--release', reportNum]).catch(() => undefined)

  // The instructions live in a file: batch-prompt.md is far larger than a safe command line.
  const prompt = `# career-ops Batch Worker\n\nYou are running headless from Careerloom — nobody can answer questions. `
    + `Read ${path.relative(root, promptFile)} and follow it exactly for this one job, then print its final JSON.`
  const label = `Evaluate ${job.company} — ${job.title}${total > 1 ? ` (${index + 1}/${total})` : ''}`
  return startAgentPrompt(label, 'evaluate', prompt, job.url, {
    env,
    jobId: job.id,
    onExit: run => {
      void (async () => {
        const result = parseWorkerResult(run.log)
        const ok = run.status === 'done' && result?.status === 'completed'
        if (ok) await mergeTracker().catch(err => console.error('merge-tracker failed:', err))
        else await release()
        appendBatchState(root, { id, url: job.url, status: ok ? 'completed' : result?.status || 'failed', startedAt, reportNum: ok ? reportNum : '-', score: result?.score ?? null, error: ok ? null : result?.error ?? `run ${run.status}` })
        await runScript(['reconcile-pipeline.mjs']).catch(err => console.error('reconcile-pipeline failed:', err))
        fs.rmSync(promptFile, { force: true })
        fs.rmSync(jdFile, { force: true })
        next(run)
      })()
    },
  })
}

/** Evaluate `jobs` one after another. Resolves with the first run; the rest follow as each ends.
 *  Cancelling any run stops the chain. */
export async function evaluateSelected(jobs: JobListing[], env: NodeJS.ProcessEnv): Promise<RunSummary> {
  const problems = profileProblems(careerOpsRoot(), dataRoot())
  if (problems.length) throw new Error(`Personalize your profile first so scores mean something: ${problems.join('; ')}. Use Resume → Build my profile.`)
  await mergeTracker().catch(err => console.error('merge-tracker failed:', err))
  const step = (i: number): Promise<RunSummary> => launchWorker(jobs[i]!, i, jobs.length, env, run => {
    if (run.status !== 'cancelled' && i + 1 < jobs.length) step(i + 1).catch(err => console.error('batch evaluation stopped:', err))
  })
  return step(0)
}
