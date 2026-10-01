import { cn } from '@/lib/utils'
import type { InterviewMode } from '@/lib/types'
import { MODES } from './interviewForm'

/** Six interview shapes as one radio group (arrow keys move the choice). */
export function ModePicker({ value, onChange }: { value: InterviewMode; onChange: (m: InterviewMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Interview type" className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
      {MODES.map((m, i) => (
        <button
          key={m.value} type="button" role="radio" aria-checked={m.value === value} tabIndex={m.value === value ? 0 : -1}
          onClick={() => onChange(m.value)}
          onKeyDown={e => {
            const d = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
            if (!d) return
            e.preventDefault()
            const next = MODES[(i + d + MODES.length) % MODES.length]!
            onChange(next.value)
            ;(e.currentTarget.parentElement?.children[MODES.indexOf(next)] as HTMLElement | undefined)?.focus()
          }}
          className={cn('flex min-w-0 flex-col gap-0.5 rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50', m.value === value ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/40')}
        >
          <span className="text-sm font-semibold text-foreground">{m.label}</span>
          <span className="text-xs text-muted-foreground">{m.blurb}</span>
        </button>
      ))}
    </div>
  )
}
