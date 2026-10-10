import { useMemo, useState } from 'react'

import type { SourceYield } from '../../lib/overviewData'

type SortKey = 'found' | 'strong' | 'name'
const SORTS: Array<{ id: SortKey; label: string }> = [{ id: 'found', label: 'Found' }, { id: 'strong', label: 'Strong' }, { id: 'name', label: 'Name' }]

/** Source yield as a real table: bars sit inside the cells so the chart and its accessible alternative are one thing. */
export function Sources({ rows, threshold, onRow }: { rows: SourceYield[]; threshold: number; onRow: (id: string) => void }) {
  const [sort, setSort] = useState<SortKey>('found')
  const sorted = useMemo(() => [...rows].sort((a, b) => (sort === 'name' ? a.name.localeCompare(b.name) : b[sort] - a[sort] || a.name.localeCompare(b.name))).slice(0, 8), [rows, sort])
  const max = Math.max(1, ...rows.map(r => r.found))
  return (
    <div className="ovx-src">
      <div className="ovx-sort" role="group" aria-label="Sort boards by">
        {SORTS.map(s => <button key={s.id} type="button" aria-pressed={sort === s.id} onClick={() => setSort(s.id)}>{s.label}</button>)}
      </div>
      <table className="ovx-table ovx-src-table">
        <caption className="sr-only">Boards by jobs found and jobs scoring {threshold} or higher</caption>
        <thead><tr><th scope="col">Board</th><th scope="col">Found vs strong ({threshold}+)</th><th scope="col" className="num">Found</th><th scope="col" className="num">Strong</th></tr></thead>
        <tbody>
          {sorted.map(r => (
            <tr key={r.id}>
              <th scope="row"><button type="button" className="ovx-link" onClick={() => onRow(r.id)} title="Show this board's jobs">{r.name}</button></th>
              <td><span className="ovx-bar" aria-hidden="true"><i className="found" style={{ width: `${(r.found / max) * 100}%` }} /><i className="strong" style={{ width: `${(r.strong / max) * 100}%` }} /></span></td>
              <td className="num">{r.found}</td>
              <td className="num">{r.strong}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length > sorted.length && <p className="ovx-foot">Top {sorted.length} of {rows.length} boards.</p>}
    </div>
  )
}
