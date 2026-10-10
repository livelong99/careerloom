import { DeltaChip, Spark } from './kit'
import type { Delta } from '../../lib/overviewData'

export type Kpi = { id: string; label: string; value: string; delta: Delta | null; spark: number[]; good?: 'up' | 'down'; fmt?: (n: number) => string; unit?: string; loading?: boolean }

/** KPI strip: number first, change vs the previous period second, sparkline last. */
export function Kpis({ items }: { items: Kpi[] }) {
  return (
    <ul className="ovx-kpis" aria-label="Key numbers">
      {items.map(k => (
        <li key={k.id} className="panel ovx-kpi">
          <span className="ovx-kpi-l">{k.label}</span>
          <span className="ovx-kpi-v">{k.loading ? '—' : k.value}</span>
          <span className="ovx-kpi-f">
            {k.loading ? <span className="ovx-delta ovx-delta-na">loading</span> : <DeltaChip d={k.delta} good={k.good} unit={k.unit} fmt={k.fmt} />}
            <Spark values={k.spark} />
          </span>
        </li>
      ))}
    </ul>
  )
}
