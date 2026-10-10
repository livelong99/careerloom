import { describe, expect, it } from 'vitest'

import { actionSignals, responseRate, dailyCountsTo, delta, goalProgress, parseTarget, pipeline, rangeWindow, rate, scoreBins, sourceYield, spendSeries, timeline, weekStart, inWindow } from './overviewData'
import type { Application, JobListing } from './types'

const NOW = new Date(2026, 9, 14) // Wed 2026-10-14
const job = (o: Partial<JobListing>): JobListing => ({ id: 'j', url: '', title: 't', company: 'c', portalId: 'p', ats: null, location: null, postedAt: null, firstSeen: '2026-10-10', trustScore: null, trustFlags: [], state: 'new', status: null, score: null, reportNum: null, reportPath: null, evaluatedAt: null, stale: false, ...o })
const app = (o: Partial<Application>): Application => ({ num: 1, date: '2026-10-10', company: 'c', via: null, role: 'r', score: null, status: 'Applied', pdf: false, report: null, notes: '', ...o })

describe('rangeWindow', () => {
  it('7d is 7 inclusive days with an equal previous period', () => {
    expect(rangeWindow('7d', NOW)).toMatchObject({ from: '2026-10-08', to: '2026-10-14', prevFrom: '2026-10-01', prevTo: '2026-10-07' })
  })
  it('all has no baseline', () => {
    const w = rangeWindow('all', NOW)
    expect(w.prevFrom).toBeNull()
    expect(inWindow('1999-01-01', w)).toBe(true)
  })
})

describe('rate / delta', () => {
  it('rate guards zero and NaN', () => {
    expect(rate(1, 4)).toBe(0.25)
    expect(rate(1, 0)).toBeNull()
    expect(rate(NaN, 3)).toBeNull()
  })
  it('delta handles missing and zero baselines', () => {
    expect(delta(6, 4)).toEqual({ value: 2, pct: 0.5, dir: 'up' })
    expect(delta(3, 0)).toMatchObject({ pct: null, dir: 'up' })
    expect(delta(2, 2)?.dir).toBe('flat')
    expect(delta(null, 2)).toBeNull()
    expect(delta(1, NaN)).toBeNull()
  })
})

describe('scoreBins', () => {
  it('bins half points, closes the top bin, ignores junk', () => {
    const bins = scoreBins([1, 1.4, 1.5, 4.5, 5, 0.5, 5.5, null, NaN])
    expect(bins).toHaveLength(8)
    expect(bins[0]!.count).toBe(2)
    expect(bins[1]!.count).toBe(1)
    expect(bins[7]!.count).toBe(2)
    expect(bins.reduce((s, b) => s + b.count, 0)).toBe(5)
  })
  it('empty input gives empty bins', () => expect(scoreBins([]).every(b => b.count === 0)).toBe(true))
})

describe('dailyCountsTo', () => {
  it('zero-fills and orders oldest first', () => {
    expect(dailyCountsTo(['2026-10-14', '2026-10-14', '2026-10-12', null], '2026-10-14', 4)).toEqual([0, 1, 0, 2])
  })
})

describe('pipeline', () => {
  it('counts found, screened, evaluated and cumulative tracker stages', () => {
    const jobs = [job({ id: 'a', score: 4.2, evaluatedAt: '2026-10-11' }), job({ id: 'b' }), job({ id: 'old', firstSeen: '2026-01-01' })]
    const apps = [app({ status: 'Applied' }), app({ status: 'Interview' }), app({ status: 'Rejected' }), app({ status: 'Offer' })]
    const p = Object.fromEntries(pipeline(jobs, new Set(['a']), apps, d => d !== null && d >= '2026-10-01').map(s => [s.id, s.count]))
    expect(p).toEqual({ found: 2, prescreened: 1, evaluated: 1, applied: 3, responded: 2, interview: 2, offer: 1 })
  })
  it('is all zeros for no data', () => expect(pipeline([], new Set(), [], () => true).every(s => s.count === 0)).toBe(true))
})

describe('sourceYield', () => {
  it('ranks boards and counts strong matches', () => {
    const rows = sourceYield([job({ portalId: 'x', score: 4.5 }), job({ portalId: 'x', score: 2 }), job({ portalId: 'y' }), job({ portalId: null })], new Map([['x', 'Board X']]), () => true)
    expect(rows[0]).toMatchObject({ name: 'Board X', found: 2, strong: 1 })
    expect(rows.map(r => r.name)).toContain('Pasted links')
  })
})

describe('timeline', () => {
  it('buckets by day for short windows and splits by status', () => {
    const w = rangeWindow('7d', NOW)
    const t = timeline([app({ date: '2026-10-10' }), app({ date: '2026-10-10', status: 'Interview' }), app({ date: '2020-01-01' })], w, null)
    expect(t).toHaveLength(7)
    const b = t.find(x => x.start === '2026-10-10')!
    expect(b).toMatchObject({ applied: 1, interview: 1, total: 2 })
  })
  it('uses week buckets over a month', () => {
    expect(timeline([], rangeWindow('90d', NOW), null).length).toBeLessThan(20)
  })
})

describe('spendSeries / weeks / goal', () => {
  it('zero-fills missing days', () => {
    const s = spendSeries([{ date: '2026-10-13', runs: 2, costUsd: 1.5, tokens: 10, byRunner: {} }], rangeWindow('7d', NOW))
    expect(s).toHaveLength(7)
    expect(s.find(d => d.date === '2026-10-13')!.runs).toBe(2)
    expect(s[0]!.runs).toBe(0)
  })
  it('weekStart is Monday', () => expect(weekStart(NOW)).toBe('2026-10-12'))
  it('goal progress clamps and validates', () => {
    expect(goalProgress(3, 5)).toBe(0.6)
    expect(goalProgress(9, 5)).toBe(1)
    expect(goalProgress(1, 0)).toBe(0)
    expect(parseTarget('5')).toBe(5)
    expect(parseTarget('0')).toBeNull()
    expect(parseTarget('abc')).toBeNull()
    expect(parseTarget('')).toBeNull()
    expect(parseTarget(null)).toBeNull()
  })
})

describe('actionSignals', () => {
  it('fires only what applies', () => {
    const jobs = [job({ state: 'evaluated', score: 4.5 }), job({ state: 'evaluated', score: 3 }), job({ state: 'applied', score: 4.8 })]
    const apps = [app({ date: '2026-10-01' }), app({ date: '2026-10-13' }), app({ date: '2026-10-01', status: 'Interview' })]
    const s = actionSignals(jobs, apps, NOW.getTime() - 2 * 86_400_000, NOW)
    expect(s).toEqual([{ id: 'strong', count: 1 }, { id: 'followups', count: 1 }])
  })
  it('flags a never-run or overdue scan, and nothing for empty data otherwise', () => {
    expect(actionSignals([], [], null, NOW)).toEqual([{ id: 'scan', daysSince: null }])
    expect(actionSignals([], [], NOW.getTime() - 9 * 86_400_000, NOW)).toEqual([{ id: 'scan', daysSince: 9 }])
    expect(actionSignals([], [], NOW.getTime(), NOW)).toEqual([])
  })
})

describe('responseRate', () => {
  it('is replies over sent, null with nothing sent', () => {
    const apps = [app({ status: 'Applied' }), app({ status: 'Responded' }), app({ status: 'Interview' }), app({ status: 'Rejected' }), app({ status: 'Evaluated' })]
    expect(responseRate(apps, () => true)).toBeCloseTo(2 / 3)
    expect(responseRate([app({ status: 'Evaluated' })], () => true)).toBeNull()
  })
})
