import { Check } from 'lucide-react'

import { Spinner } from '../ui/spinner'
import type { AtsLive } from '../../sections/resume/ctx'

const STEPS = [
  ['parse', 'Read your résumé'],
  ['agent', 'Agent reads the job'],
  ['score', 'Score'],
  ['done', 'Ready'],
] as const

/** Four phases fed by the atsEvents push channel; the running one shows the agent's latest message. */
export function PhaseStepper({ live }: { live: AtsLive }) {
  if (live.phase === 'idle' && !live.error) return null
  const at = STEPS.findIndex(([id]) => id === live.phase)
  return (
    <ol aria-label="Analysis progress" className="m-0 flex list-none flex-wrap gap-x-6 gap-y-2 p-0">
      {STEPS.map(([id, label], i) => {
        const done = i < at || live.phase === 'done'
        const now = i === at && live.running
        return (
          <li key={id} aria-current={now ? 'step' : undefined} className="flex items-center gap-2 text-sm">
            <span aria-hidden="true" className={`inline-flex size-5 items-center justify-center rounded-full border text-xs ${done ? 'border-success bg-success/15 text-success' : now ? 'border-primary text-brand-text' : 'border-border text-muted-foreground'}`}>
              {done ? <Check className="size-3" /> : now ? <Spinner className="size-3" /> : i + 1}
            </span>
            <span className={done || now ? 'text-foreground' : 'text-muted-foreground'}>{label}</span>
          </li>
        )
      })}
      <li role="status" aria-live="polite" className="basis-full text-xs text-muted-foreground">{live.error ?? live.message}</li>
    </ol>
  )
}
