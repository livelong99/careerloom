import { useState } from 'react'

import { ChartTip } from '../ChartTip'
import type { ScoreBin } from '../../lib/overviewData'

/** Score distribution: one button per half-point band, count printed on the bar (so height is never the only signal). */
export function ScoreHistogram({ bins, onBin }: { bins: ScoreBin[]; onBin: (b: ScoreBin) => void }) {
  const [tip, setTip] = useState<{ b: ScoreBin; x: number; y: number } | null>(null)
  const max = Math.max(1, ...bins.map(b => b.count))
  return (
    <div className="ovx-hist" role="group" aria-label="Score distribution, click a band to open it in Jobs">
      {bins.map(b => (
        <button
          key={b.lo}
          type="button"
          className={`ovx-hist-col${b.lo >= 4 ? ' strong' : ''}`}
          aria-label={`Scores ${b.label}: ${b.count} ${b.count === 1 ? 'job' : 'jobs'}. Show in Jobs`}
          disabled={b.count === 0}
          onClick={() => onBin(b)}
          onMouseMove={e => setTip({ b, x: e.clientX, y: e.clientY })}
          onMouseLeave={() => setTip(null)}
        >
          <span className="ovx-hist-n">{b.count}</span>
          <span className="ovx-hist-bar" style={{ height: `${(b.count / max) * 100}%` }} />
          <span className="ovx-hist-l">{b.lo.toFixed(1)}</span>
        </button>
      ))}
      {tip && <ChartTip x={tip.x} y={tip.y}><div className="chart-tip-d">Score {tip.b.label}</div><div className="chart-tip-v">{tip.b.count} {tip.b.count === 1 ? 'job' : 'jobs'}</div></ChartTip>}
    </div>
  )
}

export function ScoreTable({ bins }: { bins: ScoreBin[] }) {
  return (
    <table className="ovx-table">
      <caption className="sr-only">Score distribution</caption>
      <thead><tr><th scope="col">Score band</th><th scope="col" className="num">Jobs</th></tr></thead>
      <tbody>{bins.map(b => <tr key={b.lo}><th scope="row">{b.label}</th><td className="num">{b.count}</td></tr>)}</tbody>
    </table>
  )
}
