import { localDateKey } from './period'
import { stageOf } from './stages'
import type { Application, JobListing, MetricDay } from './types'

// Pure data helpers for the Overview widgets. Dates are local YYYY-MM-DD keys.

export type RangeId = '7d' | '30d' | '90d' | 'all'
export const RANGES: Array<{ id: RangeId; label: string; days: number | null }> = [
  { id: '7d', label: '7d', days: 7 }, { id: '30d', label: '30d', days: 30 }, { id: '90d', label: '90d', days: 90 }, { id: 'all', label: 'All', days: null },
]
export const isRangeId = (v: unknown): v is RangeId => RANGES.some(r => r.id === v)
/** A strong match: the score bar the Overview uses for "worth your time". */
export const STRONG_SCORE = 4

export type Window = { from: string; to: string; prevFrom: string | null; prevTo: string | null; days: number | null }

const shift = (key: string, days: number): string => {
  const [y, m, d] = key.split('-').map(Number) as [number, number, number]
  return localDateKey(new Date(y, m - 1, d + days))
}

/** Inclusive window ending today, plus the equally long period before it (null for All: no baseline). */
export function rangeWindow(range: RangeId, now = new Date()): Window {
  const to = localDateKey(now)
  const days = RANGES.find(r => r.id === range)?.days ?? null
  if (days === null) return { from: '0000-00-00', to, prevFrom: null, prevTo: null, days }
  const from = shift(to, -(days - 1))
  return { from, to, prevFrom: shift(from, -days), prevTo: shift(from, -1), days }
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}/
export const dayOf = (v: string | null | undefined): string | null => (v && DAY_RE.test(v) ? v.slice(0, 10) : null)
export const inRange = (day: string | null, from: string, to: string): boolean => day !== null && day >= from && day <= to
export const inWindow = (day: string | null, w: Window): boolean => inRange(day, w.from, w.to)
export const inPrev = (day: string | null, w: Window): boolean => w.prevFrom !== null && w.prevTo !== null && inRange(day, w.prevFrom, w.prevTo)

/** n / d as a 0..1 ratio, or null when it is undefined (no denominator, NaN). */
export function rate(n: number, d: number): number | null {
  return Number.isFinite(n) && Number.isFinite(d) && d > 0 ? n / d : null
}

export type Delta = { value: number; pct: number | null; dir: 'up' | 'down' | 'flat' }
/** Change vs the previous period. `pct` is null when there is no baseline to divide by. */
export function delta(cur: number | null, prev: number | null): Delta | null {
  if (cur === null || prev === null || !Number.isFinite(cur) || !Number.isFinite(prev)) return null
  const value = cur - prev
  return { value, pct: prev === 0 ? null : value / Math.abs(prev), dir: value > 1e-9 ? 'up' : value < -1e-9 ? 'down' : 'flat' }
}

export const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((s, x) => s + x, 0) / xs.length : null)

/** Zero-filled per-day counts for the last `n` days ending at `to`, oldest first. */
export function dailyCountsTo(days: Array<string | null>, to: string, n: number): number[] {
  const counts = new Map<string, number>()
  for (const d of days) if (d) counts.set(d, (counts.get(d) ?? 0) + 1)
  return Array.from({ length: n }, (_, i) => counts.get(shift(to, i - (n - 1))) ?? 0)
}

/** Sparkline length: the range itself, or the last 30 days for All. */
export const sparkDays = (w: Window): number => w.days ?? 30

// ————— Score distribution —————
export type ScoreBin = { lo: number; hi: number; label: string; count: number }
const BIN_EDGES = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5]
/** Half-point bins from 1.0 to 5.0 (the last is closed). Scores outside 1..5 and non-numbers are ignored. */
export function scoreBins(scores: Array<number | null>): ScoreBin[] {
  const bins = BIN_EDGES.slice(0, -1).map((lo, i) => ({ lo, hi: BIN_EDGES[i + 1]!, label: `${lo.toFixed(1)}–${BIN_EDGES[i + 1]!.toFixed(1)}`, count: 0 }))
  for (const s of scores) {
    if (s === null || !Number.isFinite(s) || s < 1 || s > 5) continue
    bins[Math.min(bins.length - 1, Math.floor((s - 1) * 2))]!.count++
  }
  return bins
}

// ————— Pipeline —————
export type PipelineId = 'found' | 'prescreened' | 'evaluated' | 'applied' | 'responded' | 'interview' | 'offer'
export type PipelineStage = { id: PipelineId; label: string; count: number }
const LABELS: Record<PipelineId, string> = { found: 'Found', prescreened: 'Pre-screened', evaluated: 'Evaluated', applied: 'Applied', responded: 'Responded', interview: 'Interview', offer: 'Offer' }
const RANK: Record<string, number> = { applied: 1, responded: 2, interview: 3, offer: 4, hired: 4 }
const PIPE_IDS: PipelineId[] = ['found', 'prescreened', 'evaluated', 'applied', 'responded', 'interview', 'offer']

/** Found → offer counts inside the window. Applied+ are cumulative ("reached at least"), from the tracker. */
/** Day a job counts as evaluated: its evaluation date, else when it was first seen; null if it has no score. */
export const evaluatedDay = (j: JobListing): string | null => (j.score === null ? null : dayOf(j.evaluatedAt ?? j.firstSeen))

/** Share of applications in the window that got any reply (responded or further). */
export function responseRate(apps: Application[], inside: (d: string | null) => boolean): number | null {
  const sent = apps.filter(a => inside(dayOf(a.date)) && (RANK[stageOf(a.status)] ?? 0) >= 1)
  return rate(sent.filter(a => (RANK[stageOf(a.status)] ?? 0) >= 2).length, sent.length)
}

export function pipeline(jobs: JobListing[], screenedIds: ReadonlySet<string>, apps: Application[], inside: (d: string | null) => boolean): PipelineStage[] {
  const found = jobs.filter(j => inside(dayOf(j.firstSeen)))
  const evaluated = jobs.filter(j => inside(evaluatedDay(j))).length
  const reached = (rank: number) => apps.filter(a => inside(dayOf(a.date)) && (RANK[stageOf(a.status)] ?? 0) >= rank).length
  const counts: Record<PipelineId, number> = {
    found: found.length,
    prescreened: found.filter(j => screenedIds.has(j.id)).length,
    evaluated,
    applied: reached(1), responded: reached(2), interview: reached(3), offer: reached(4),
  }
  return PIPE_IDS.map(id => ({ id, label: LABELS[id], count: counts[id] }))
}

// ————— Source yield —————
export type SourceYield = { id: string; name: string; found: number; strong: number }
/** Jobs found per board in the window, and how many of them scored at or above the threshold. */
export function sourceYield(jobs: JobListing[], names: ReadonlyMap<string, string>, inside: (d: string | null) => boolean, threshold = STRONG_SCORE): SourceYield[] {
  const by = new Map<string, SourceYield>()
  for (const j of jobs) {
    if (!inside(dayOf(j.firstSeen))) continue
    const id = j.portalId ?? '(pasted)'
    const row = by.get(id) ?? { id, name: j.portalId ? names.get(j.portalId) ?? j.portalId : 'Pasted links', found: 0, strong: 0 }
    row.found++
    if ((j.score ?? 0) >= threshold) row.strong++
    by.set(id, row)
  }
  return [...by.values()].sort((a, b) => b.found - a.found || a.name.localeCompare(b.name))
}

// ————— Applications over time —————
export const TIMELINE_SERIES = ['applied', 'responded', 'interview', 'offer', 'closed'] as const
export type TimelineSeries = (typeof TIMELINE_SERIES)[number]
export type TimelineBucket = { start: string; label: string; total: number } & Record<TimelineSeries, number>
const seriesOf = (status: string): TimelineSeries | null => {
  const s = stageOf(status)
  if (s === 'applied' || s === 'responded' || s === 'interview') return s
  if (s === 'offer' || s === 'hired') return 'offer'
  return s === 'rejected' || s === 'discarded' ? 'closed' : null
}
/** Applications grouped by tracker date into day buckets (week buckets when the window is over 31 days), split by current status. */
export function timeline(apps: Application[], w: Window, firstDay: string | null): TimelineBucket[] {
  const from = w.days === null ? firstDay ?? w.to : w.from
  const step = (w.days ?? 91) > 31 ? 7 : 1
  const out: TimelineBucket[] = []
  for (let start = from; start <= w.to; start = shift(start, step)) {
    out.push({ start, label: start, total: 0, applied: 0, responded: 0, interview: 0, offer: 0, closed: 0 })
  }
  for (const a of apps) {
    const day = dayOf(a.date); const series = seriesOf(a.status)
    if (!day || !series || day < from || day > w.to) continue
    const idx = Math.min(out.length - 1, Math.floor(daysBetween(from, day) / step))
    out[idx]![series]++; out[idx]!.total++
  }
  return out
}
export function daysBetween(a: string, b: string): number {
  const p = (k: string) => { const [y, m, d] = k.split('-').map(Number) as [number, number, number]; return Date.UTC(y, m - 1, d) }
  return Math.round((p(b) - p(a)) / 86_400_000)
}

// ————— Agent spend —————
/** Zero-filled daily spend + runs across the window (All: the last 90 days, matching Monitoring). */
export function spendSeries(daily: MetricDay[], w: Window): MetricDay[] {
  const from = w.days === null ? shift(w.to, -89) : w.from
  const byDate = new Map(daily.map(d => [d.date, d]))
  const n = daysBetween(from, w.to) + 1
  return Array.from({ length: n }, (_, i) => { const date = shift(from, i); return byDate.get(date) ?? { date, runs: 0, costUsd: 0, tokens: 0, byRunner: {} } })
}

// ————— Goal —————
/** Monday (local) of the week containing `now`. */
export function weekStart(now = new Date()): string {
  const dow = (now.getDay() + 6) % 7
  return localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow))
}
export const goalProgress = (done: number, target: number): number => (target > 0 ? Math.min(1, done / target) : 0)
export function parseTarget(raw: string | null): number | null {
  const n = Number(raw)
  return raw !== null && raw.trim() !== '' && Number.isInteger(n) && n >= 1 && n <= 100 ? n : null
}

// ————— Next best actions —————
export const FOLLOW_UP_DAYS = 7
export const STALE_SCAN_DAYS = 7
export type ActionSignal =
  | { id: 'strong'; count: number }
  | { id: 'followups'; count: number }
  | { id: 'scan'; daysSince: number | null }
/** What deserves attention now: strong matches nobody acted on, applications with no movement for a week, a scan that is overdue. Only signals that fire are returned. */
export function actionSignals(jobs: JobListing[], apps: Application[], lastScanAt: number | null, now = new Date()): ActionSignal[] {
  const out: ActionSignal[] = []
  const strong = jobs.filter(j => j.state === 'evaluated' && (j.score ?? 0) >= STRONG_SCORE).length
  if (strong > 0) out.push({ id: 'strong', count: strong })
  const cutoff = shift(localDateKey(now), -FOLLOW_UP_DAYS)
  const due = apps.filter(a => stageOf(a.status) === 'applied' && (dayOf(a.date) ?? '9999') <= cutoff).length
  if (due > 0) out.push({ id: 'followups', count: due })
  const daysSince = lastScanAt === null ? null : Math.floor((now.getTime() - lastScanAt) / 86_400_000)
  if (daysSince === null || daysSince >= STALE_SCAN_DAYS) out.push({ id: 'scan', daysSince })
  return out
}
