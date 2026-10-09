import type { Run, RunStatus } from './types'

export { redactLog } from '../../electron/log-redact'

export type RunFilter = { status: 'all' | RunStatus; runner: string; kind: string; range: 'all' | 'today' | '7d' | '30d'; q: string; /** 'all' | 'none' (runs without a job) | a job id */ job: string }
export const EMPTY_FILTER: RunFilter = { status: 'all', runner: 'all', kind: 'all', range: 'all', q: '', job: 'all' }

/** What the Runs page needs of a job to name it and link to it. */
export type JobRef = { id: string; url: string; title: string; company: string; reportNum: number | null }
export type JobOf<J extends JobRef = JobRef> = (run: Run) => J | null

export const KINDS = ['evaluate', 'scan', 'resume', 'copilot', 'setup', 'agent', 'research'] as const
const KIND_OF_MODE: Record<string, (typeof KINDS)[number]> = {
  evaluate: 'evaluate', pipeline: 'evaluate', ats: 'evaluate',
  scan: 'scan', 'web-board': 'scan',
  pdf: 'resume', cover: 'resume', apply: 'resume', intake: 'resume', 'interview-prep': 'resume',
  practice: 'copilot', live: 'copilot',
  setup: 'setup', interview: 'setup',
  'job-research': 'research',
}
/** What the user thinks of the run as: evaluate, scan, resume, copilot, research (job knowledge base), setup (installs, updates) or agent (everything else). */
export function kindOf(run: Pick<Run, 'mode'>): (typeof KINDS)[number] {
  return KIND_OF_MODE[run.mode] ?? (/^(skill|source)-/.test(run.mode) ? 'setup' : 'agent')
}

const DAY = 86_400_000
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
const SINCE: Record<RunFilter['range'], (now: number) => number> = {
  all: () => 0, today: startOfDay, '7d': now => startOfDay(now - 6 * DAY), '30d': now => startOfDay(now - 29 * DAY),
}

export function filterRuns(runs: Run[], f: RunFilter, now = Date.now(), jobOf: JobOf = () => null): Run[] {
  const since = SINCE[f.range](now)
  const q = f.q.trim().toLowerCase()
  return runs.filter(r => {
    if ((f.status !== 'all' && r.status !== f.status) || (f.runner !== 'all' && r.runner !== f.runner) || (f.kind !== 'all' && kindOf(r) !== f.kind) || r.startedAt < since) return false
    const job = f.job === 'all' && !q ? null : jobOf(r)
    if (f.job === 'none' ? job !== null : f.job !== 'all' && job?.id !== f.job) return false
    return !q || `${r.label} ${r.mode} ${r.input ?? ''} ${job?.title ?? ''} ${job?.company ?? ''}`.toLowerCase().includes(q)
  })
}

export function runTotals(runs: Run[], now = Date.now()) {
  const day = startOfDay(now)
  let today = 0, running = 0, failed = 0, tokens = 0, costUsd = 0
  for (const r of runs) {
    if (r.startedAt >= day) today++
    if (r.status === 'running') running++
    if (r.status === 'failed') failed++
    tokens += (r.usage?.inputTokens ?? 0) + (r.usage?.outputTokens ?? 0)
    costUsd += r.usage?.costUsd ?? 0
  }
  return { today, running, failed, tokens, costUsd }
}

export const elapsedMs = (r: Pick<Run, 'startedAt' | 'endedAt'>, now = Date.now()) => Math.max(0, (r.endedAt ?? now) - r.startedAt)

/** Next selected id for arrow/Home/End keys; clamps at the ends, starts at the first row. */
export function moveSelection(ids: string[], current: string | null, move: number | 'start' | 'end'): string | null {
  if (!ids.length) return null
  if (move === 'start') return ids[0]!
  if (move === 'end') return ids[ids.length - 1]!
  const i = current ? ids.indexOf(current) : -1
  return ids[Math.min(ids.length - 1, Math.max(0, i + move))]!
}

export type LogStep = { line: number; text: string; kind: 'tool' | 'ok' | 'fail' }
/** The runner's own markers (▸ tool call, ✓ done, ✗ failed) as a timeline; `line` is the 0-based log line. */
export function logSteps(log: string): LogStep[] {
  const steps: LogStep[] = []
  log.split('\n').forEach((l, line) => {
    const m = /^([▸✓✗]) ?(.*)$/.exec(l)
    if (m) steps.push({ line, text: m[2]!, kind: m[1] === '▸' ? 'tool' : m[1] === '✓' ? 'ok' : 'fail' })
  })
  return steps
}

const REPORT_MODES = new Set(['apply', 'pdf', 'cover', 'interview-prep', 'contacto'])
const RESUME_MODES = new Set(['pdf', 'cover', 'intake'])

/** Run → its job: the id stamped on the run, else the posting link (evaluate), else the report number
 *  (report modes), else "Evaluate Company — Title" in an older run's label. Null when there is none, or the job is gone. */
export function indexJobs<J extends JobRef>(jobs: ReadonlyArray<J>): JobOf<J> {
  const byId = new Map<string, J>(), byUrl = new Map<string, J>(), byNum = new Map<string, J>(), byLabel = new Map<string, J>()
  for (const j of jobs) {
    byId.set(j.id, j); byUrl.set(j.url, j)
    if (j.reportNum !== null) byNum.set(String(j.reportNum), j)
    byLabel.set(`Evaluate ${j.company} — ${j.title}`, j)
  }
  return run => {
    if (run.jobId) return byId.get(run.jobId) ?? null
    const input = (run.input ?? '').trim()
    if (input) {
      const hit = byUrl.get(input) ?? (REPORT_MODES.has(run.mode) ? byNum.get(input) : undefined)
      if (hit) return hit
    }
    return run.mode === 'evaluate' ? byLabel.get(run.label.replace(/ \(\d+\/\d+\)$/, '')) ?? null : null
  }
}

/** Where a run's result lives: its job, the Resume workspace, or Boards. */
export function runLinks(run: Pick<Run, 'mode'>, job: Pick<JobRef, 'id'> | null) {
  return { jobId: job?.id ?? null, resume: RESUME_MODES.has(run.mode), boards: kindOf(run) === 'scan' }
}

export type RunGroupBy = 'none' | 'job' | 'status'
export type RunGroup = { key: string; title: string; job: JobRef | null; runs: Run[] }
const STATUS_ORDER: RunStatus[] = ['running', 'failed', 'cancelled', 'done']

/** `none`: one group in list order. `job`: one timeline per job (oldest run first), the most recently active job first, job-less runs last.
 *  `status`: running, failed, cancelled, done. Empty groups are dropped. */
export function groupRuns(runs: Run[], by: RunGroupBy, jobOf: JobOf): RunGroup[] {
  if (by === 'none') return [{ key: 'all', title: 'All runs', job: null, runs }]
  if (by === 'status') return STATUS_ORDER.map(st => ({ key: st, title: st, job: null, runs: runs.filter(r => r.status === st) })).filter(g => g.runs.length)
  const groups = new Map<string, RunGroup>()
  for (const r of runs) {
    const job = jobOf(r)
    const key = job?.id ?? 'none'
    const g = groups.get(key) ?? { key, title: job ? `${job.title} — ${job.company}` : 'No job', job, runs: [] }
    g.runs.push(r)
    groups.set(key, g)
  }
  const latest = (g: RunGroup) => Math.max(...g.runs.map(r => r.startedAt))
  return [...groups.values()]
    .map(g => ({ ...g, runs: [...g.runs].sort((a, b) => a.startedAt - b.startedAt) }))
    .sort((a, b) => (a.key === 'none' ? 1 : b.key === 'none' ? -1 : latest(b) - latest(a)))
}
