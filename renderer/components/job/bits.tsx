import type { ReactNode } from 'react'

import { Badge } from '@/components/ui/badge'
import { Progress } from '@/components/ui/progress'
import { Skeleton } from '@/components/ui/skeleton'

import type { JobView } from '../../lib/types'

export const Block = ({ title, children, className = '' }: { title: string; children: ReactNode; className?: string }) => (
  <section className={`rounded-lg border border-border p-4 ${className}`}>
    <h3 className="m-0 mb-2 text-sm font-semibold text-foreground">{title}</h3>
    {children}
  </section>
)

export const Bullets = ({ items, empty }: { items: string[]; empty?: string }) =>
  items.length
    ? <ul className="m-0 list-disc space-y-1 pl-5 text-sm text-foreground">{items.map((t, i) => <li key={`${i}-${t}`}>{t}</li>)}</ul>
    : <p className="m-0 text-sm text-muted-foreground">{empty ?? 'Not stated.'}</p>

export const Chips = ({ items, variant = 'neutral' }: { items: string[]; variant?: 'neutral' | 'success' | 'danger' | 'warn' | 'brand' }) => (
  <div className="flex flex-wrap gap-1.5">{items.map(t => <Badge key={t} variant={variant}>{t}</Badge>)}</div>
)

/** A 0–5 dimension as a labelled meter. */
export function Meter({ label, value, note }: { label: string; value: number; note?: string | null }) {
  // career-ops scores red flags as a penalty: 0 is clean, more is worse.
  const penalty = /red.?flag/i.test(label)
  const v = Math.abs(value)
  const band = penalty ? (v === 0 ? 'bg-success' : v < 2 ? 'bg-warning' : 'bg-destructive') : v >= 4 ? 'bg-success' : v >= 3 ? 'bg-warning' : 'bg-destructive'
  return (
    <div className="space-y-1" title={note ?? undefined}>
      <div className="flex justify-between text-sm"><span>{penalty ? `${label} (lower is better)` : label}</span><span className="tabular-nums text-muted-foreground">{penalty && v === 0 ? 'None' : `${v.toFixed(1)}/5`}</span></div>
      <Progress value={penalty && v === 0 ? 100 : Math.min(5, v) * 20} className="h-2" indicatorClassName={band} aria-label={`${label} ${value} out of 5`} />
    </div>
  )
}

/** First clause of a long value (<= ~80 chars); the rest sits behind "more". */
export const shortValue = (v: string): string => {
  const first = v.split(/\s[—–]\s|\s\(|;\s|\.\s/)[0]!.trim()
  return first.length <= 80 ? first : `${first.slice(0, 77).trimEnd()}…`
}

export const Facts = ({ rows }: { rows: Array<[string, string | null | undefined]> }) => {
  const shown = rows.filter((r): r is [string, string] => Boolean(r[1]))
  return shown.length
    ? <dl className="m-0 grid grid-cols-[11rem_1fr] gap-y-1.5 text-sm">{shown.map(([k, v]) => {
      const s = shortValue(v)
      return [<dt key={`${k}k`} className="text-muted-foreground">{k}</dt>, <dd key={`${k}v`} className="m-0 break-words">{s}{s !== v && <details className="mt-0.5 text-xs text-muted-foreground"><summary className="cursor-pointer">more</summary>{v}</details>}</dd>]
    })}</dl>
    : <p className="m-0 text-sm text-muted-foreground">Nothing stated.</p>
}

/** Which model structured this and what it cost, so the user sees the price of every generated section. */
export function ModelFooter({ meta }: { meta: JobView['meta'] }) {
  const text = meta.filled === 'model' ? `Structured with ${meta.model ?? 'the helper model'}${meta.tokens ? ` · ${meta.tokens.toLocaleString()} tokens` : ''}`
    : meta.filled === 'model-failed' ? 'Read without a model (the helper model was unavailable)' : 'Read without a model — no tokens used'
  return <p className="m-0 text-xs text-muted-foreground">{text}</p>
}

export const TabSkeleton = () => (
  <div className="space-y-3 p-4" aria-busy="true"><Skeleton className="h-6 w-1/3" /><Skeleton className="h-24 w-full" /><Skeleton className="h-24 w-full" /></div>
)
