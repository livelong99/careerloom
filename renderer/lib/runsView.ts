import type { Run, RunStatus } from './types'

export { redactLog } from '../../electron/log-redact'

export type RunFilter = { status: 'all' | RunStatus; runner: string; kind: string; range: 'all' | 'today' | '7d' | '30d'; q: string }
export const EMPTY_FILTER: RunFilter = { status: 'all', runner: 'all', kind: 'all', range: 'all', q: '' }

export const KINDS = ['evaluate', 'scan', 'resume', 'copilot', 'setup', 'agent'] as const
const KIND_OF_MODE: Record<string, (typeof KINDS)[number]> = {
  evaluate: 'evaluate', pipeline: 'evaluate', ats: 'evaluate',
  scan: 'scan', 'web-board': 'scan',
  pdf: 'resume', cover: 'resume', apply: 'resume', intake: 'resume', 'interview-prep': 'resume',
  practice: 'copilot', live: 'copilot',
  setup: 'setup', interview: 'setup',
}
/** What the user thinks of the run as: evaluate, scan, resume, copilot, setup (installs, updates) or agent (everything else). */
export function kindOf(run: Pick<Run, 'mode'>): (typeof KINDS)[number] {
  return KIND_OF_MODE[run.mode] ?? (/^(skill|source|plugin)-/.test(run.mode) ? 'setup' : 'agent')
}

const DAY = 86_400_000
const startOfDay = (t: number) => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime() }
const SINCE: Record<RunFilter['range'], (now: number) => number> = {
  all: () => 0, today: startOfDay, '7d': now => startOfDay(now - 6 * DAY), '30d': now => startOfDay(now - 29 * DAY),
}

export function filterRuns(runs: Run[], f: RunFilter, now = Date.now()): Run[] {
  const since = SINCE[f.range](now)
  const q = f.q.trim().toLowerCase()
  return runs.filter(r =>
    (f.status === 'all' || r.status === f.status) &&
    (f.runner === 'all' || r.runner === f.runner) &&
    (f.kind === 'all' || kindOf(r) === f.kind) &&
    r.startedAt >= since &&
    (!q || `${r.label} ${r.mode} ${r.input ?? ''}`.toLowerCase().includes(q)))
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
/** Where a run's result lives: its job (by posting link, or report number for report modes), the Resume workspace, or Boards. */
export function runLinks(run: Pick<Run, 'mode' | 'input'>, jobs: ReadonlyArray<{ id: string; url: string; reportNum: number | null }>) {
  const input = (run.input ?? '').trim()
  const job = input ? jobs.find(j => j.url === input || (REPORT_MODES.has(run.mode) && j.reportNum !== null && String(j.reportNum) === input)) : undefined
  return { jobId: job?.id ?? null, resume: RESUME_MODES.has(run.mode), boards: kindOf(run) === 'scan' }
}
