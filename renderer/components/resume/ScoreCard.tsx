import { CircleHelp } from 'lucide-react'

import type { ScoreBlock } from '../../lib/types'
import { Alert, AlertDescription, AlertTitle } from '../ui/alert'
import { Badge } from '../ui/badge'
import { HoverCard, HoverCardContent, HoverCardTrigger } from '../ui/hover-card'
import { Progress } from '../ui/progress'
import { range } from './format'

const TONE = { high: 'success', medium: 'warn', low: 'danger' } as const

/** One score, always with its range, confidence and the honest "heuristic" label. Code computed every number. */
export function ScoreCard({ title, block, label, note, compact = false }: {
  title: string
  block: ScoreBlock
  label: string
  /** Extra line under the label (degraded-mode hint, what the score means). */
  note?: string
  compact?: boolean
}) {
  const ceiling = block.caps.find(c => c.id === 'ceiling')
  return (
    <section aria-label={title} className="flex min-w-0 flex-col gap-3 rounded-xl border border-border p-4">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h3 className="m-0 text-[13px] font-semibold text-foreground">{title}</h3>
        <span className="text-3xl leading-none font-semibold text-foreground tabular-nums">{block.score}</span>
        <span className="text-sm text-muted-foreground tabular-nums" title="The score could reasonably fall in this range">range {range(block)}</span>
        <Badge variant={TONE[block.confidence]}>{block.confidence} confidence</Badge>
      </header>
      <Progress value={block.score} className="h-2" indicatorClassName="rounded-full bg-primary" aria-label={`${title} ${block.score} out of 100`} />
      <p className="m-0 text-xs text-muted-foreground">{label}{note ? `. ${note}` : ''}{ceiling ? `. Never scores above ${ceiling.max}: ${ceiling.reason.toLowerCase()}` : ''}</p>
      {block.caps.filter(c => c.id !== 'ceiling').map(c => (
        <Alert key={c.id}>
          <AlertTitle>Capped at {c.max}</AlertTitle>
          <AlertDescription>{c.reason}</AlertDescription>
        </Alert>
      ))}
      {!compact && (
        <ul className="m-0 flex list-none flex-col gap-2 p-0">
          {block.parts.map(p => (
            <li key={p.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1">
              <span className="flex items-center gap-1.5 text-sm text-foreground">
                {p.label}
                {p.evidence && (
                  <HoverCard openDelay={100}>
                    <HoverCardTrigger asChild>
                      <button type="button" aria-label={`Why: ${p.label}`} className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring">
                        <CircleHelp className="size-3.5" aria-hidden="true" />
                      </button>
                    </HoverCardTrigger>
                    <HoverCardContent className="w-72 text-xs text-muted-foreground">{p.evidence}</HoverCardContent>
                  </HoverCard>
                )}
              </span>
              <span className="text-sm text-muted-foreground tabular-nums">{p.got} / {p.max}</span>
              <Progress value={(p.got / p.max) * 100} className="col-span-2 h-1" indicatorClassName="rounded-full bg-primary" aria-hidden="true" />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
