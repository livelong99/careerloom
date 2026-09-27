import { localDateKey } from '../../lib/period'
import type { MetricDay } from '../../lib/types'

// "All" has no natural start; cap the drawn window so a years-old account
// doesn't render thousands of empty day-slots.
const ALL_TIME_CAP_DAYS = 90

function emptyDay(date: string): MetricDay {
  return { date, runs: 0, costUsd: 0, tokens: 0, byRunner: {} }
}

/** Zero-filled, contiguous [fromKey..toKey] window: a real (sparse) MetricDay
 *  entry fills its day, every other day gets an empty placeholder — so a
 *  single active day renders as one narrow bar across the full period
 *  instead of stretching to fill the whole chart. */
export function contiguousDaily(daily: MetricDay[], fromKey: string, toKey: string): MetricDay[] {
  if (fromKey > toKey) return []
  const byDate = new Map(daily.map(d => [d.date, d]))
  const [fy, fm, fd] = fromKey.split('-').map(Number)
  const [ty, tm, td] = toKey.split('-').map(Number)
  const cursor = new Date(fy, fm - 1, fd)
  const end = new Date(ty, tm - 1, td)
  const out: MetricDay[] = []
  while (cursor <= end) {
    const key = localDateKey(cursor)
    out.push(byDate.get(key) ?? emptyDay(key))
    cursor.setDate(cursor.getDate() + 1)
  }
  return out
}

/** The window to draw for the daily chart: the selected 7D/30D range as-is;
 *  for All (no range), first activity → today, capped to the last 90 days. */
export function dailyChartWindow(range: { from: string; to: string } | null, daily: MetricDay[]): { from: string; to: string } | null {
  if (range) return range
  if (!daily.length) return null
  const now = new Date()
  const today = localDateKey(now)
  const earliest = daily.reduce((min, d) => (d.date < min ? d.date : min), daily[0]!.date)
  const cappedFrom = localDateKey(new Date(now.getFullYear(), now.getMonth(), now.getDate() - (ALL_TIME_CAP_DAYS - 1)))
  return { from: earliest > cappedFrom ? earliest : cappedFrom, to: today }
}
