// Small controls shared by the Audio / Transcription / Appearance pages: native select styling, radio pills, status chip.
import type { KeyboardEvent, ReactNode } from 'react'

import { inputBaseClass } from '@/components/ui/input'
import { cn } from '@/lib/utils'

/** Native <select> (keyboard and screen-reader behaviour for free), styled like the kit's Input. */
export const selectClass = cn(inputBaseClass, 'w-auto min-w-44 pr-8')

export const rangeClass = 'h-1.5 w-40 cursor-pointer accent-(--accent,currentColor)'

/** A segmented single choice with radio semantics and left/right arrow keys. */
export function Pills<T extends string>({ label, value, options, onChange }: { label: string; value: T; options: ReadonlyArray<{ value: T; label: string }>; onChange: (v: T) => void }) {
  const move = (e: KeyboardEvent, i: number): void => {
    const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!d) return
    e.preventDefault()
    const next = options[(i + d + options.length) % options.length]!
    onChange(next.value)
    ;(e.currentTarget.parentElement?.children[options.indexOf(next)] as HTMLElement | undefined)?.focus()
  }
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex gap-0.5 rounded-lg bg-muted p-0.5">
      {options.map((o, i) => (
        <button
          key={o.value} type="button" role="radio" aria-checked={o.value === value} tabIndex={o.value === value ? 0 : -1}
          onClick={() => onChange(o.value)} onKeyDown={e => move(e, i)}
          className={cn('h-7 cursor-pointer rounded-md border border-transparent px-3 text-xs font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50', o.value === value ? 'bg-background text-foreground shadow-xs' : 'bg-transparent text-muted-foreground hover:text-foreground')}
        >{o.label}</button>
      ))}
    </div>
  )
}

/** Text chip: state is always words, colour only reinforces it. */
export function Chip({ tone = 'neutral', children }: { tone?: 'neutral' | 'ok' | 'warn' | 'bad' | 'brand'; children: ReactNode }) {
  const t = { neutral: 'bg-muted text-muted-foreground', ok: 'bg-success/10 text-success', warn: 'bg-warning/10 text-warning', bad: 'bg-destructive/10 text-destructive', brand: 'bg-primary/[0.12] text-brand-text' }[tone]
  return <span className={cn('inline-flex items-center rounded-full px-2 py-px text-xs font-medium whitespace-nowrap', t)}>{children}</span>
}
