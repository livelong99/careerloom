import { useId, useState, type ReactNode } from 'react'

import { Skeleton } from '../ui/skeleton'
import { EmptyNote } from '../EmptyState'
import type { Delta } from '../../lib/overviewData'

export type WidgetState = 'loading' | 'error' | 'empty' | 'ready'

/** One Overview card: header (title, extras, optional chart/table switch) and a body that is a skeleton, error, empty call to action or the chart. The body keeps a fixed height so state changes never shift the layout. */
export function Widget({ title, className = '', state, height = 220, extra, error, onRetry, emptyText, emptyAction, chart, table }: {
  title: string
  className?: string
  state: WidgetState
  height?: number
  extra?: ReactNode
  error?: string
  onRetry?: () => void
  emptyText?: string
  emptyAction?: ReactNode
  chart: ReactNode
  /** Accessible alternative to the chart; when given the card gets a Chart/Table switch. */
  table?: ReactNode
}) {
  const [asTable, setAsTable] = useState(false)
  const id = useId()
  return (
    <section className={`panel ovx-widget ${className}`} aria-labelledby={id}>
      <div className="phead">
        <b id={id}>{title}</b>
        <span className="r ovx-head-extra">
          {extra}
          {table && state === 'ready' && (
            <button type="button" className="ovx-link" aria-pressed={asTable} onClick={() => setAsTable(v => !v)}>{asTable ? 'Chart' : 'Table'}</button>
          )}
        </span>
      </div>
      <div className="pbody ovx-body" style={{ minHeight: height }}>
        {state === 'loading' && (
          <div role="status" aria-label={`Loading ${title}`} className="ovx-skel">
            <Skeleton className="h-3 w-1/3 motion-safe:animate-pulse" /><Skeleton className="w-full flex-1 motion-safe:animate-pulse" /><Skeleton className="h-3 w-2/3 motion-safe:animate-pulse" />
          </div>
        )}
        {state === 'error' && (
          <div className="ovx-state" role="alert">
            <EmptyNote>{error || 'Could not load this.'}</EmptyNote>
            {onRetry && <button type="button" className="btnp" onClick={onRetry}>Try again</button>}
          </div>
        )}
        {state === 'empty' && (
          <div className="ovx-state">
            <EmptyNote>{emptyText}</EmptyNote>
            {emptyAction}
          </div>
        )}
        {state === 'ready' && (asTable && table ? table : chart)}
      </div>
    </section>
  )
}

/** Tiny trend line; decorative (the card's number carries the meaning). */
export function Spark({ values, width = 96, height = 28 }: { values: number[]; width?: number; height?: number }) {
  const max = Math.max(...values, 0)
  if (values.length < 2 || max === 0) return <svg className="ovx-spark" width={width} height={height} aria-hidden="true"><line x1="0" x2={width} y1={height - 2} y2={height - 2} className="ovx-spark-flat" /></svg>
  const pts = values.map((v, i) => `${((i / (values.length - 1)) * (width - 2) + 1).toFixed(1)},${(height - 3 - (v / max) * (height - 6)).toFixed(1)}`)
  return (
    <svg className="ovx-spark" width={width} height={height} aria-hidden="true">
      <polyline points={`1,${height - 1} ${pts.join(' ')} ${width - 1},${height - 1}`} className="ovx-spark-area" />
      <polyline points={pts.join(' ')} className="ovx-spark-line" />
    </svg>
  )
}

/** "+12%" / "▲ 3" style change chip; direction is also spelled out for screen readers. */
export function DeltaChip({ d, unit = '', good = 'up', fmt }: { d: Delta | null; unit?: string; good?: 'up' | 'down'; fmt?: (n: number) => string }) {
  if (!d) return <span className="ovx-delta ovx-delta-na">no prior period</span>
  const body = d.pct === null ? (fmt ? fmt(Math.abs(d.value)) : `${Math.abs(d.value)}${unit}`) : `${Math.round(Math.abs(d.pct) * 100)}%`
  const word = d.dir === 'flat' ? 'unchanged' : d.dir === 'up' ? 'up' : 'down'
  const tone = d.dir === 'flat' ? 'flat' : d.dir === good ? 'good' : 'bad'
  return (
    <span className={`ovx-delta ovx-delta-${tone}`}>
      <span aria-hidden="true">{d.dir === 'up' ? '▲' : d.dir === 'down' ? '▼' : '–'}</span>
      <span>{d.dir === 'flat' ? 'flat' : body}</span>
      <span className="sr-only">{word} {d.dir === 'flat' ? '' : body} vs previous period</span>
    </span>
  )
}
