import type { QuestionType, SessionSummary } from '@/lib/types'

const DAY = 86_400_000
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const two = (n: number): string => String(n).padStart(2, '0')

/** "Today 09:40", "Yesterday", else "28 Sep" (year added when not this year). */
export function dateLabel(at: number, now: number = Date.now()): string {
  const d = new Date(at), n = new Date(now)
  const startOf = (x: Date): number => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime()
  const diff = Math.round((startOf(n) - startOf(d)) / DAY)
  if (diff === 0) return `Today ${two(d.getHours())}:${two(d.getMinutes())}`
  if (diff === 1) return 'Yesterday'
  return `${d.getDate()} ${MONTHS[d.getMonth()]}${d.getFullYear() === n.getFullYear() ? '' : ` ${d.getFullYear()}`}`
}

export const minutesLabel = (sec: number): string => (sec < 60 ? '<1 min' : `${Math.round(sec / 60)} min`)
export const scoreLabel = (s: number | null): string => (s === null ? 'Not scored' : `${s.toFixed(1)} / 5`)

export const TYPE_LABEL: Record<QuestionType, string> = { behavioural: 'Behavioural', technical: 'Technical', 'system-design': 'System design', coding: 'Coding', other: 'Other' }
export const TYPE_TONE: Record<QuestionType, 'warn' | 'info' | 'violet' | 'neutral'> = { behavioural: 'warn', technical: 'info', 'system-design': 'violet', coding: 'info', other: 'neutral' }

export type JobGroup = { jobId: string; jobTitle: string; company: string; sessions: SessionSummary[]; first: number | null; last: number | null }
/** Sessions grouped by job (newest activity first); trend = oldest and newest score among scored sessions. */
export function groupByJob(sessions: SessionSummary[]): JobGroup[] {
  const by = new Map<string, SessionSummary[]>()
  for (const s of [...sessions].sort((a, b) => b.startedAt - a.startedAt)) by.set(s.jobId, [...(by.get(s.jobId) ?? []), s])
  return [...by.values()].map(list => {
    const scored = list.filter(s => s.score !== null)
    const newest = list[0]!
    return { jobId: newest.jobId, jobTitle: newest.jobTitle, company: newest.company, sessions: list, first: scored.length > 1 ? scored[scored.length - 1]!.score : null, last: scored.length > 1 ? scored[0]!.score : null }
  })
}
