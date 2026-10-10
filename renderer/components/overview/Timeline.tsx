import { useState } from 'react'

import { ChartTip } from '../ChartTip'
import { formatChartDate } from '../../lib/period'
import { TIMELINE_SERIES, type TimelineBucket, type TimelineSeries } from '../../lib/overviewData'

const META: Record<TimelineSeries, { label: string; color: string }> = {
  applied: { label: 'Applied', color: 'var(--ov-applied)' },
  responded: { label: 'Responded', color: 'var(--ov-responded)' },
  interview: { label: 'Interview', color: 'var(--ov-interview)' },
  offer: { label: 'Offer', color: 'var(--ov-offer)' },
  closed: { label: 'Closed', color: 'var(--ov-closed)' },
}
const W = 560
const H = 170
const PAD = { l: 26, r: 4, t: 8, b: 20 }

/** Applications over time, stacked by current status. Legend entries toggle a series; the Table view has the same numbers. */
export function Timeline({ buckets, weekly }: { buckets: TimelineBucket[]; weekly: boolean }) {
  const [off, setOff] = useState<ReadonlySet<TimelineSeries>>(new Set())
  const [tip, setTip] = useState<{ b: TimelineBucket; x: number; y: number } | null>(null)
  const on = TIMELINE_SERIES.filter(s => !off.has(s))
  const sum = (b: TimelineBucket) => on.reduce((t, s) => t + b[s], 0)
  const max = Math.max(1, ...buckets.map(sum))
  const iw = W - PAD.l - PAD.r
  const slot = iw / Math.max(1, buckets.length)
  const bw = Math.max(2, Math.min(28, slot - 2))
  const y = (v: number) => PAD.t + (1 - v / max) * (H - PAD.t - PAD.b)
  const toggle = (s: TimelineSeries) => setOff(prev => { const n = new Set(prev); if (n.has(s)) n.delete(s); else n.add(s); return n })
  const tickEvery = Math.max(1, Math.ceil(buckets.length / 6))
  return (
    <div className="ovx-tl">
      <ul className="ovx-legend" aria-label="Series, toggle to show or hide">
        {TIMELINE_SERIES.map(s => (
          <li key={s}>
            <button type="button" aria-pressed={!off.has(s)} onClick={() => toggle(s)}>
              <i style={{ background: META[s].color }} aria-hidden="true" />{META[s].label}
            </button>
          </li>
        ))}
      </ul>
      <svg viewBox={`0 0 ${W} ${H}`} className="ovx-tl-svg" role="img" aria-label={`Applications ${weekly ? 'per week' : 'per day'} by status. The Table view lists every value.`}>
        {[0, 0.5, 1].map(f => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} className="ovx-grid-line" />
            <text x={PAD.l - 4} y={y(max * f) + 3} textAnchor="end" className="ovx-axis">{Math.round(max * f)}</text>
          </g>
        ))}
        {buckets.map((b, i) => {
          const x = PAD.l + slot * i + (slot - bw) / 2
          let acc = 0
          return (
            <g key={b.start} onMouseMove={e => setTip({ b, x: e.clientX, y: e.clientY })} onMouseLeave={() => setTip(null)}>
              <rect x={PAD.l + slot * i} y={PAD.t} width={slot} height={H - PAD.t - PAD.b} fill="transparent" />
              {on.map(s => {
                const v = b[s]; if (!v) return null
                const y1 = y(acc + v); const h = y(acc) - y1; acc += v
                return <rect key={s} x={x} y={y1} width={bw} height={h} fill={META[s].color} rx="1.5" />
              })}
              {i % tickEvery === 0 && <text x={x + bw / 2} y={H - 5} textAnchor="middle" className="ovx-axis">{formatChartDate(b.start)}</text>}
            </g>
          )
        })}
      </svg>
      {tip && (
        <ChartTip x={tip.x} y={tip.y}>
          <div className="chart-tip-d">{weekly ? 'Week of ' : ''}{formatChartDate(tip.b.start)}</div>
          {TIMELINE_SERIES.map(s => <div key={s} className="chart-tip-row"><i className="chart-tip-sw" style={{ background: META[s].color, opacity: 1 }} /><span>{META[s].label}</span><b>{tip.b[s]}</b></div>)}
        </ChartTip>
      )}
    </div>
  )
}

export function TimelineTable({ buckets, weekly }: { buckets: TimelineBucket[]; weekly: boolean }) {
  return (
    <div className="ovx-scroll">
      <table className="ovx-table">
        <caption className="sr-only">Applications by status</caption>
        <thead><tr><th scope="col">{weekly ? 'Week of' : 'Day'}</th>{TIMELINE_SERIES.map(s => <th key={s} scope="col" className="num">{META[s].label}</th>)}</tr></thead>
        <tbody>{buckets.filter(b => b.total > 0).map(b => <tr key={b.start}><th scope="row">{b.start}</th>{TIMELINE_SERIES.map(s => <td key={s} className="num">{b[s]}</td>)}</tr>)}</tbody>
      </table>
    </div>
  )
}
