import { useState } from 'react'

import { ChartTip } from '../ChartTip'
import { formatUsd } from '../../lib/format'
import { formatChartDate } from '../../lib/period'
import type { MetricDay } from '../../lib/types'

const W = 520
const H = 130
const PAD = { l: 4, r: 4, t: 8, b: 16 }

/** Daily agent spend as a line over faint run-count bars. */
export function Spend({ days, successRate, totalCost, totalRuns }: { days: MetricDay[]; successRate: number; totalCost: number; totalRuns: number }) {
  const [tip, setTip] = useState<{ d: MetricDay; x: number; y: number } | null>(null)
  const maxC = Math.max(0.01, ...days.map(d => d.costUsd))
  const maxR = Math.max(1, ...days.map(d => d.runs))
  const iw = W - PAD.l - PAD.r
  const ih = H - PAD.t - PAD.b
  const slot = iw / Math.max(1, days.length)
  const cx = (i: number) => PAD.l + slot * (i + 0.5)
  const line = days.map((d, i) => `${cx(i).toFixed(1)},${(PAD.t + (1 - d.costUsd / maxC) * ih).toFixed(1)}`).join(' ')
  return (
    <div className="ovx-spend">
      <dl className="ovx-spend-sum">
        <div><dt>Spend</dt><dd>{formatUsd(totalCost)}</dd></div>
        <div><dt>Runs</dt><dd>{totalRuns}</dd></div>
        <div><dt>Succeeded</dt><dd>{totalRuns ? `${Math.round(successRate * 100)}%` : '—'}</dd></div>
      </dl>
      <svg viewBox={`0 0 ${W} ${H}`} className="ovx-spend-svg" role="img" aria-label={`Daily agent spend, ${formatUsd(totalCost)} over ${totalRuns} runs`}>
        {days.map((d, i) => d.runs > 0 && <rect key={`r${d.date}`} x={cx(i) - Math.max(1, slot / 2 - 1)} y={PAD.t + (1 - d.runs / maxR) * ih} width={Math.max(2, slot - 2)} height={(d.runs / maxR) * ih} className="ovx-spend-bar" />)}
        <polyline points={line} className="ovx-spend-line" />
        {days.map((d, i) => (
          <rect key={d.date} x={PAD.l + slot * i} y={0} width={slot} height={H} fill="transparent" onMouseMove={e => setTip({ d, x: e.clientX, y: e.clientY })} onMouseLeave={() => setTip(null)} />
        ))}
        <text x={PAD.l} y={H - 3} className="ovx-axis">{days[0] ? formatChartDate(days[0].date) : ''}</text>
        <text x={W - PAD.r} y={H - 3} textAnchor="end" className="ovx-axis">{days.length ? formatChartDate(days[days.length - 1]!.date) : ''}</text>
      </svg>
      {tip && <ChartTip x={tip.x} y={tip.y}><div className="chart-tip-d">{formatChartDate(tip.d.date)}</div><div className="chart-tip-v">{formatUsd(tip.d.costUsd)}</div><div className="chart-tip-s">{tip.d.runs} {tip.d.runs === 1 ? 'run' : 'runs'}</div></ChartTip>}
    </div>
  )
}

export function SpendTable({ days }: { days: MetricDay[] }) {
  const active = days.filter(d => d.runs > 0 || d.costUsd > 0)
  return (
    <div className="ovx-scroll">
      <table className="ovx-table">
        <caption className="sr-only">Daily agent spend and runs</caption>
        <thead><tr><th scope="col">Day</th><th scope="col" className="num">Runs</th><th scope="col" className="num">Spend</th></tr></thead>
        <tbody>{active.map(d => <tr key={d.date}><th scope="row">{d.date}</th><td className="num">{d.runs}</td><td className="num">{formatUsd(d.costUsd)}</td></tr>)}</tbody>
      </table>
    </div>
  )
}
