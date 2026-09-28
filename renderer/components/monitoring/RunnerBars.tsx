import { useMemo, useState } from 'react'

import { ChartTip } from '../ChartTip'
import { formatCompact } from '../../lib/format'
import { formatChartDate } from '../../lib/period'
import type { MetricDay } from '../../lib/types'

/** Unique integer ticks for a run-count axis: 0, max, and a midpoint only when
 *  it's distinct from both — niceTicks' 1/2/2.5/5 ladder is built for money
 *  and produces sub-1 fractional ticks (0.25/0.5/0.75) that round to duplicate
 *  integers ("1 1 1 0 0") once small counts like 1-2 runs/day are involved. */
function integerTicks(max: number): number[] {
  const top = Math.max(1, Math.round(max))
  const mid = Math.round(top / 2)
  const ticks = [0]
  if (mid > 0 && mid < top) ticks.push(mid)
  ticks.push(top)
  return ticks
}

/** Max on-screen width of one day's bar column, in px — otherwise a single
 *  active day in a wide panel stretches into one giant bar. */
const MAX_BAR_PX = 24

// codeburn's model-series palette, reused for the runner ids (opencode/zen are tints); anything
// else (setup/script/unknown) falls back to the fifth "other" swatch.
const RUNNER_COLOR: Record<string, string> = {
  claude: 'var(--s-flagship)',
  codex: 'var(--s-premium)',
  antigravity: 'var(--s-balanced)',
  api: 'var(--s-fast)',
  opencode: 'color-mix(in oklch, var(--s-balanced) 55%, var(--s-other))',
  zen: 'color-mix(in oklch, var(--s-fast) 55%, var(--s-other))',
}
const OTHER_COLOR = 'var(--s-other)'
const RUNNER_ORDER = ['claude', 'codex', 'antigravity', 'opencode', 'zen', 'api']
export const colorForRunner = (id: string) => RUNNER_COLOR[id] ?? OTHER_COLOR

/** Daily run count stacked by runner (codeburn StackedBars.tsx, adapted from
 *  per-model $ spend to per-runner run counts — no separate axis lib needed,
 *  ponytail: skipped the grow-in animation from lib/motion, add useBarGrowIn if wanted. */
export function RunnerBars({ daily }: { daily: MetricDay[] }) {
  const [tip, setTip] = useState<{ day: MetricDay; x: number; y: number } | null>(null)
  const runners = useMemo(() => {
    const seen = new Set<string>()
    for (const day of daily) for (const id of Object.keys(day.byRunner)) if (day.byRunner[id]) seen.add(id)
    return [...RUNNER_ORDER.filter(id => seen.has(id)), ...[...seen].filter(id => !RUNNER_ORDER.includes(id)).sort()]
  }, [daily])

  if (!daily.length) return <p className="empty-note">No runs in this period.</p>

  const maxRuns = Math.max(1, ...daily.map(d => d.runs))
  const ticks = integerTicks(maxRuns)
  const axisMax = ticks.at(-1) || 1
  // One label slot per day, matching the bars 1:1 (only tick days show text),
  // so labels line up under their bar however narrow/wide the columns render —
  // no separate `justify-between` row to fall out of sync with capped-width bars.
  const xTickIndices = new Set(daily.map((_, index) => index).filter(index => (daily.length - 1 - index) % 4 === 0))
  const barBasis = { flex: `0 1 ${MAX_BAR_PX}px` }

  return (
    <div className="flex flex-col gap-2">
      <div className="relative flex h-[150px] items-end gap-1 border-b border-[var(--line2)] pr-8">
        <div className="pointer-events-none absolute inset-0 right-8">
          {ticks.map(tick => (
            <span key={tick} className="absolute left-0 right-0 border-t border-[var(--line2)]" style={{ bottom: `${(tick / axisMax) * 100}%` }} />
          ))}
        </div>
        {daily.map(day => (
          <div
            key={day.date}
            className="relative flex h-full flex-col-reverse gap-px"
            style={barBasis}
            onMouseEnter={e => setTip({ day, x: e.clientX, y: e.clientY })}
            onMouseMove={e => setTip({ day, x: e.clientX, y: e.clientY })}
            onMouseLeave={() => setTip(null)}
          >
            {runners.filter(id => day.byRunner[id]).map(id => (
              <span
                key={id}
                className="w-full rounded-sm"
                style={{ height: `${Math.max(2, (day.byRunner[id]! / axisMax) * 100)}%`, background: colorForRunner(id) }}
              />
            ))}
          </div>
        ))}
        <div className="absolute right-0 top-0 flex h-full w-8 flex-col-reverse justify-between text-right text-xs tabular-nums text-[var(--mut)]">
          {ticks.map(tick => <span key={tick} style={{ position: 'absolute', bottom: `${(tick / axisMax) * 100}%`, transform: 'translateY(50%)' }}>{formatCompact(tick)}</span>)}
        </div>
      </div>
      <div className="flex gap-1 pr-8 text-center text-xs text-[var(--mut)]">
        {daily.map((day, index) => <span key={day.date} style={barBasis}>{xTickIndices.has(index) ? formatChartDate(day.date) : ''}</span>)}
      </div>
      <div className="flex flex-wrap gap-3 text-xs text-[var(--mut)]">
        {runners.map(id => (
          <span key={id} className="flex items-center gap-1.5">
            <i className="inline-block h-2 w-2 rounded-full" style={{ background: colorForRunner(id) }} />
            {id}
          </span>
        ))}
      </div>
      {tip && (
        <ChartTip x={tip.x} y={tip.y}>
          <div className="chart-tip-d">{formatChartDate(tip.day.date)}</div>
          {runners.filter(id => tip.day.byRunner[id]).map(id => (
            <div className="chart-tip-row" key={id}><span>{id}</span><b>{tip.day.byRunner[id]}</b></div>
          ))}
        </ChartTip>
      )}
    </div>
  )
}
