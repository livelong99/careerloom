import { Group } from './Group'
import type { PlanPreview } from '@/lib/types'

const money = (usd: number): string => (usd === 0 ? '$0' : `≈ $${usd.toFixed(2)}`)

/** "This session": what the user will get before pressing Start. */
export function SessionSummary({ preview, error, loading }: { preview: PlanPreview | null; error: string | null; loading: boolean }) {
  return (
    <Group title="This session">
      {error ? <p role="alert" className="m-0 text-xs text-destructive">{error}</p> : !preview ? <p className="m-0 text-xs text-muted-foreground">{loading ? 'Working out your session…' : 'Pick a job with a question base to see the session.'}</p> : (
        <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 text-sm" aria-live="polite">
          <dt className="text-muted-foreground">Questions</dt><dd className="m-0 text-right tabular-nums">{preview.questions} + follow-ups</dd>
          <dt className="text-muted-foreground">Sourced</dt><dd className="m-0 text-right tabular-nums">{preview.sourced} of {preview.questions}</dd>
          <dt className="text-muted-foreground">Length</dt><dd className="m-0 text-right tabular-nums">about {preview.minutes} min</dd>
          <dt className="text-muted-foreground">Estimated cost</dt><dd className="m-0 text-right tabular-nums">{money(preview.usd)}</dd>
        </dl>
      )}
      <p className="m-0 mt-3 text-xs text-muted-foreground">Captions are always on. Skip and Replay are in the overlay, and you can type an answer instead of speaking.</p>
    </Group>
  )
}
