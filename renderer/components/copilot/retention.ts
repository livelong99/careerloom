import type { SessionSummary } from '@/lib/types'

const DAY = 86_400_000
export const RETENTION_OPTIONS: ReadonlyArray<{ value: string; days: number | null; label: string }> = [
  { value: '0', days: 0, label: "Don't keep transcripts" },
  { value: '30', days: 30, label: '1 month' },
  { value: '90', days: 90, label: '3 months' },
  { value: '180', days: 180, label: '6 months' },
  { value: '365', days: 365, label: '1 year' },
  { value: 'forever', days: null, label: 'Until I delete them' },
]
export const retentionLabel = (days: number | null): string => RETENTION_OPTIONS.find(o => o.days === days)?.label ?? `${days} days`

/** Sessions that lose their transcript text when retention goes from `from` to `to` (already-swept ones are older than `from`, so excluded). */
export function newlyExpired(sessions: SessionSummary[], from: number | null, to: number | null, now: number = Date.now()): number {
  if (to === null) return 0
  return sessions.filter(s => {
    const age = now - (s.endedAt ?? s.startedAt)
    const out = to === 0 ? s.endedAt !== null : age > to * DAY
    const wasOut = from === null ? false : from === 0 ? s.endedAt !== null : age > from * DAY
    return out && !wasOut
  }).length
}
