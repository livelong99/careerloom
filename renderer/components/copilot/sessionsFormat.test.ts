import { describe, expect, it } from 'vitest'

import { dateLabel, groupByJob, minutesLabel, scoreLabel } from './sessionsFormat'
import type { SessionSummary } from '@/lib/types'

const NOW = new Date(2026, 9, 1, 12, 0).getTime()
const at = (d: number, h = 9, m = 40) => new Date(2026, 9, d, h, m).getTime()
const s = (id: string, jobId: string, startedAt: number, score: number | null): SessionSummary => ({ id, startedAt, endedAt: startedAt + 1000, mode: 'practice', jobId, jobTitle: `T-${jobId}`, company: `C-${jobId}`, questions: 1, durationSec: 60, score })

describe('labels', () => {
  it('dates: today with time, yesterday, then day + month', () => {
    expect(dateLabel(at(1), NOW)).toBe('Today 09:40')
    expect(dateLabel(new Date(2026, 8, 28).getTime(), NOW)).toBe('28 Sep')
    expect(dateLabel(new Date(2026, 8, 30, 9).getTime(), NOW)).toBe('Yesterday')
    expect(dateLabel(new Date(2025, 8, 28).getTime(), NOW)).toBe('28 Sep 2025')
  })
  it('minutes and scores', () => {
    expect(minutesLabel(20)).toBe('<1 min'); expect(minutesLabel(1080)).toBe('18 min')
    expect(scoreLabel(3.94)).toBe('3.9 / 5'); expect(scoreLabel(null)).toBe('Not scored')
  })
})
describe('groupByJob', () => {
  it('groups newest first and reports the trend across scored sessions', () => {
    const g = groupByJob([s('a', 'j1', at(1), 3.9), s('b', 'j1', at(0 + 1) - 86_400_000, 3.6), s('c', 'j2', at(1) - 5 * 86_400_000, null), s('d', 'j1', at(1) - 3 * 86_400_000, null)])
    expect(g.map(x => x.jobId)).toEqual(['j1', 'j2'])
    expect(g[0]!.sessions.map(x => x.id)).toEqual(['a', 'b', 'd'])
    expect([g[0]!.first, g[0]!.last]).toEqual([3.6, 3.9])
    expect([g[1]!.first, g[1]!.last]).toEqual([null, null])
  })
  it('keeps the snapshot title even when the job is gone (no lookup)', () => {
    expect(groupByJob([s('a', 'gone', at(1), 4)])[0]).toMatchObject({ jobTitle: 'T-gone', company: 'C-gone' })
  })
})
