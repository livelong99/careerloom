import fs from 'node:fs'
import path from 'node:path'

import { readPipeline, readTracker, type Application } from './careerops'
import { dataRoot, readRunHistory, runs, runScript, summary, type Handler, type RunSummary } from './context'

// Monitoring: run analytics + career-ops funnel + improvement findings.
// Contract: renderer/lib/types.ts (CareerloomBridge › Monitoring). Owned by the Monitoring builder.
// Types here are local, structural copies of the renderer contract (electron's
// tsconfig rootDir excludes renderer/, same reason careerops.ts duplicates Application).

export type DateRange = { from: string; to: string } // YYYY-MM-DD, inclusive
export type MetricBucket = { id: string; runs: number; failed: number; costUsd: number; tokens: number; durationMs: number }
export type MetricDay = { date: string; runs: number; costUsd: number; tokens: number; byRunner: Record<string, number> }
export type FindingSeverity = 'high' | 'medium' | 'low'
export type FindingAction = { kind: 'mode'; mode: string; input?: string; label: string } | { kind: 'navigate'; section: string; label: string } | null
export type Finding = { id: string; severity: FindingSeverity; title: string; detail: string; action: FindingAction }
export type Metrics = {
  range: DateRange | null
  totals: { runs: number; failed: number; cancelled: number; costUsd: number; tokens: number; avgDurationMs: number; successRate: number }
  byRunner: MetricBucket[]
  byMode: MetricBucket[]
  daily: MetricDay[]
  starts: number[]
  funnel: unknown
  velocity: unknown
  findings: Finding[]
}

function isDateRange(v: unknown): v is DateRange {
  const r = v as Partial<DateRange> | null
  return !!r && typeof r === 'object' && typeof r.from === 'string' && typeof r.to === 'string'
    && /^\d{4}-\d{2}-\d{2}$/.test(r.from) && /^\d{4}-\d{2}-\d{2}$/.test(r.to)
}

/** Local calendar date key, matching renderer/lib/period.ts's localDateKey. */
export function localDateKey(ms: number): string {
  const d = new Date(ms)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function inRange(dateKey: string, range: DateRange | null): boolean {
  return !range || (dateKey >= range.from && dateKey <= range.to)
}

function emptyBucket(id: string): MetricBucket {
  return { id, runs: 0, failed: 0, costUsd: 0, tokens: 0, durationMs: 0 }
}

/** Pure aggregation over run history — no filesystem or child-process access. */
export function aggregateRuns(history: RunSummary[], range: DateRange | null): Omit<Metrics, 'range' | 'funnel' | 'velocity' | 'findings'> {
  const rows = history.filter(r => inRange(localDateKey(r.startedAt), range))
  const byRunner = new Map<string, MetricBucket>()
  const byMode = new Map<string, MetricBucket>()
  const daily = new Map<string, MetricDay>()
  let doneCount = 0, failedCount = 0, cancelledCount = 0, costUsd = 0, tokens = 0, durationSum = 0, durationCount = 0

  const addTo = (map: Map<string, MetricBucket>, id: string, r: RunSummary, dur: number) => {
    const b = map.get(id) ?? emptyBucket(id)
    b.runs += 1
    if (r.status === 'failed') b.failed += 1
    b.costUsd += r.usage?.costUsd ?? 0
    b.tokens += (r.usage?.inputTokens ?? 0) + (r.usage?.outputTokens ?? 0)
    b.durationMs += dur
    map.set(id, b)
  }

  for (const r of rows) {
    const dur = r.endedAt ? r.endedAt - r.startedAt : 0
    if (r.status === 'done') doneCount++
    if (r.status === 'failed') failedCount++
    if (r.status === 'cancelled') cancelledCount++
    costUsd += r.usage?.costUsd ?? 0
    tokens += (r.usage?.inputTokens ?? 0) + (r.usage?.outputTokens ?? 0)
    if (r.endedAt) { durationSum += dur; durationCount++ }
    addTo(byRunner, r.runner, r, dur)
    addTo(byMode, r.mode, r, dur)

    const key = localDateKey(r.startedAt)
    const day = daily.get(key) ?? { date: key, runs: 0, costUsd: 0, tokens: 0, byRunner: {} }
    day.runs += 1
    day.costUsd += r.usage?.costUsd ?? 0
    day.tokens += (r.usage?.inputTokens ?? 0) + (r.usage?.outputTokens ?? 0)
    day.byRunner[r.runner] = (day.byRunner[r.runner] ?? 0) + 1
    daily.set(key, day)
  }

  // Cancelled runs are excluded from the rate — cancelling isn't a signal
  // about whether the run would have worked.
  const finished = doneCount + failedCount
  return {
    totals: {
      runs: rows.length, failed: failedCount, cancelled: cancelledCount, costUsd, tokens,
      avgDurationMs: durationCount ? durationSum / durationCount : 0,
      successRate: finished ? doneCount / finished : 0,
    },
    byRunner: [...byRunner.values()].sort((a, b) => b.runs - a.runs),
    byMode: [...byMode.values()].sort((a, b) => b.runs - a.runs),
    daily: [...daily.values()].sort((a, b) => a.date.localeCompare(b.date)),
    starts: rows.map(r => r.startedAt),
  }
}

// ————— Findings: "steps to improve", each thresholded and one-click actionable —————

const MIN_UNAPPLIED_MATCHES = 3
const MIN_FIT_SCORE_FOR_MATCH = 4
const SCAN_STALE_DAYS = 7
const PIPELINE_BACKLOG_MAX = 5
const MIN_EVALUATIONS_FOR_FIT_AVG = 5
const LOW_FIT_AVG = 3.5
const MIN_RUNS_FOR_FAILURE_RATE = 3
const HIGH_FAILURE_RATE = 0.3
const FOLLOWUP_STALE_DAYS = 7
const MIN_REJECTIONS = 3
const HIGH_COST_PER_EVAL_USD = 0.5
const DAY_MS = 86_400_000

const statusIs = (status: string, name: string) => status.trim().toLowerCase() === name.toLowerCase()

export type FindingsInput = {
  profile: { cv: boolean; profile: boolean; portals: boolean }
  apps: Application[]
  pipelineBacklog: number
  /** ms of the most recently finished 'scan' run, or null if none ever ran. */
  lastScanAt: number | null
  /** Injectable for tests; defaults to Date.now() at the call site. */
  now: number
  byRunner: MetricBucket[]
  byMode: MetricBucket[]
}

const SEVERITY_ORDER: Record<FindingSeverity, number> = { high: 0, medium: 1, low: 2 }

/** Pure: no filesystem, no child process. Each rule is independent and tiny. */
export function computeFindings(input: FindingsInput): Finding[] {
  const { profile, apps, pipelineBacklog, lastScanAt, now, byRunner, byMode } = input
  const daysAgo = (ms: number) => (now - ms) / DAY_MS
  const findings: Finding[] = []

  const missingProfile = (['cv', 'profile', 'portals'] as const).filter(k => !profile[k])
  if (missingProfile.length) {
    findings.push({
      id: 'profile-incomplete',
      severity: 'high',
      title: 'Finish setting up your profile',
      detail: `Missing ${missingProfile.join(', ')} — the agent works best with a complete profile.`,
      action: { kind: 'mode', mode: 'interview', label: 'Build my profile' },
    })
  }

  const unappliedMatches = apps.filter(a => statusIs(a.status, 'Evaluated') && (a.score ?? 0) >= MIN_FIT_SCORE_FOR_MATCH)
  if (unappliedMatches.length >= MIN_UNAPPLIED_MATCHES) {
    findings.push({
      id: 'unapplied-matches',
      severity: 'high',
      title: `${unappliedMatches.length} strong matches waiting on you`,
      detail: `${unappliedMatches.length} evaluated roles scored ${MIN_FIT_SCORE_FOR_MATCH}+/5 and haven't been applied to yet.`,
      action: { kind: 'navigate', section: 'jobs', label: 'Review jobs' },
    })
  }

  if (lastScanAt === null || daysAgo(lastScanAt) >= SCAN_STALE_DAYS) {
    findings.push({
      id: 'scan-stale',
      severity: 'medium',
      title: 'No recent portal scan',
      detail: lastScanAt === null ? 'A scan has never run.' : `The last scan was ${Math.floor(daysAgo(lastScanAt))} days ago.`,
      action: { kind: 'mode', mode: 'scan', label: 'Scan portals' },
    })
  }

  if (pipelineBacklog > PIPELINE_BACKLOG_MAX) {
    findings.push({
      id: 'pipeline-backlog',
      severity: 'medium',
      title: 'Inbox is backing up',
      detail: `${pipelineBacklog} items are waiting to be processed.`,
      action: { kind: 'mode', mode: 'pipeline', label: 'Process inbox' },
    })
  }

  const scored = apps.filter(a => a.score !== null)
  if (scored.length >= MIN_EVALUATIONS_FOR_FIT_AVG) {
    const avg = scored.reduce((s, a) => s + (a.score ?? 0), 0) / scored.length
    if (avg < LOW_FIT_AVG) {
      findings.push({
        id: 'low-fit-average',
        severity: 'medium',
        title: 'Average fit is low',
        detail: `Average score is ${avg.toFixed(1)}/5 across ${scored.length} evaluations — try adjacent titles or close a skill gap.`,
        action: { kind: 'mode', mode: 'upskill', label: 'Find skill gaps' },
      })
    }
  }

  for (const bucket of byRunner) {
    if (bucket.runs >= MIN_RUNS_FOR_FAILURE_RATE && bucket.failed / bucket.runs >= HIGH_FAILURE_RATE) {
      findings.push({
        id: `runner-failures-${bucket.id}`,
        severity: 'high',
        title: `${bucket.id} is failing often`,
        detail: `${bucket.failed} of ${bucket.runs} runs failed (${Math.round((bucket.failed / bucket.runs) * 100)}%).`,
        action: { kind: 'navigate', section: 'settings', label: 'Check settings' },
      })
    }
  }

  const staleFollowups = apps.filter(a =>
    statusIs(a.status, 'Applied') && /^\d{4}-\d{2}-\d{2}$/.test(a.date) && daysAgo(new Date(a.date).getTime()) > FOLLOWUP_STALE_DAYS,
  )
  if (staleFollowups.length) {
    findings.push({
      id: 'followups-due',
      severity: 'medium',
      title: `${staleFollowups.length} follow-ups due`,
      detail: `${staleFollowups.length} applications have had no update in over ${FOLLOWUP_STALE_DAYS} days.`,
      action: { kind: 'mode', mode: 'followup', label: 'Check follow-ups' },
    })
  }

  const rejections = apps.filter(a => statusIs(a.status, 'Rejected')).length
  if (rejections >= MIN_REJECTIONS) {
    findings.push({
      id: 'rejection-patterns',
      severity: 'low',
      title: 'Look for rejection patterns',
      detail: `${rejections} rejections so far — worth checking for a common cause.`,
      action: { kind: 'mode', mode: 'patterns', label: 'Find patterns' },
    })
  }

  const evaluateBucket = byMode.find(b => b.id === 'evaluate')
  if (evaluateBucket && evaluateBucket.runs > 0) {
    const costPerEval = evaluateBucket.costUsd / evaluateBucket.runs
    if (costPerEval > HIGH_COST_PER_EVAL_USD) {
      findings.push({
        id: 'high-eval-cost',
        severity: 'low',
        title: 'Evaluations are costing more than they need to',
        detail: `Averaging $${costPerEval.toFixed(2)} per evaluation — the API runner supports free/cheap models for this mode.`,
        action: { kind: 'navigate', section: 'settings', label: 'Try the API runner' },
      })
    }
  }

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity])
}

// ————— IPC handler —————

function parseScriptJson(res: { code: number | null; stdout: string } | null): unknown {
  if (!res || res.code !== 0) return null
  try { return JSON.parse(res.stdout) } catch { return null }
}

export const metricsHandlers: Record<string, Handler> = {
  getMetrics: async (rangeArg?: unknown): Promise<Metrics> => {
    const range = isDateRange(rangeArg) ? rangeArg : null
    const live = [...runs.values()].map(summary)
    const liveIds = new Set(live.map(r => r.id))
    const history = [...readRunHistory().filter(r => !liveIds.has(r.id)), ...live]
    const agg = aggregateRuns(history, range)

    const base = dataRoot()
    const apps = readTracker(base)
    const pipelineBacklog = readPipeline(base).filter(p => !p.done).length
    const lastScanAt = history.reduce<number | null>(
      (max, r) => (r.mode === 'scan' && r.endedAt ? Math.max(max ?? 0, r.endedAt) : max), null,
    )
    const has = (rel: string) => fs.existsSync(path.join(base, rel))
    const profile = { cv: has('cv.md'), profile: has('config/profile.yml'), portals: has('portals.yml') }

    // career-ops' own zero-token analytics scripts; tolerate a missing/failing
    // checkout (fresh installs, no career-ops root yet) by degrading to null.
    const [statsResult, velocityResult] = await Promise.all([
      runScript(['stats.mjs']).catch(() => null),
      runScript(['funnel-velocity.mjs']).catch(() => null),
    ])

    const findings = computeFindings({ profile, apps, pipelineBacklog, lastScanAt, now: Date.now(), byRunner: agg.byRunner, byMode: agg.byMode })

    return { range, ...agg, funnel: parseScriptJson(statsResult), velocity: parseScriptJson(velocityResult), findings }
  },
}
