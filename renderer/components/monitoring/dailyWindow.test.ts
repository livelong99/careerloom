import { describe, expect, it } from 'vitest'

import { localDateKey } from '../../lib/period'
import type { MetricDay } from '../../lib/types'
import { contiguousDaily, dailyChartWindow } from './dailyWindow'

function day(date: string, runs = 1): MetricDay {
  return { date, runs, costUsd: 0, tokens: 0, byRunner: {} }
}

describe('contiguousDaily', () => {
  it('zero-fills a single active day across the full window', () => {
    const result = contiguousDaily([day('2026-06-10', 3)], '2026-06-08', '2026-06-12')
    expect(result.map(d => d.date)).toEqual(['2026-06-08', '2026-06-09', '2026-06-10', '2026-06-11', '2026-06-12'])
    expect(result.map(d => d.runs)).toEqual([0, 0, 3, 0, 0])
  })

  it('returns an empty array when from is after to', () => {
    expect(contiguousDaily([], '2026-06-12', '2026-06-08')).toEqual([])
  })
})

describe('dailyChartWindow', () => {
  it('passes an explicit range through unchanged', () => {
    expect(dailyChartWindow({ from: '2026-06-01', to: '2026-06-30' }, [])).toEqual({ from: '2026-06-01', to: '2026-06-30' })
  })

  it('returns null for All with no data at all', () => {
    expect(dailyChartWindow(null, [])).toBeNull()
  })

  it('spans first activity to today for All when within the cap', () => {
    const today = new Date()
    const recentKey = localDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() - 5))
    const window = dailyChartWindow(null, [day(recentKey)])
    expect(window?.from).toBe(recentKey)
  })

  it('caps the All window to the last 90 days for an old account', () => {
    const window = dailyChartWindow(null, [day('2020-01-01')])
    const from = new Date(window!.from)
    const to = new Date(window!.to)
    const days = Math.round((to.getTime() - from.getTime()) / 86_400_000)
    expect(days).toBeLessThanOrEqual(90)
  })
})
