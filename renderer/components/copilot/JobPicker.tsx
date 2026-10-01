import { Button } from '@/components/ui/button'
import { navigate } from '@/lib/nav'
import type { JobListing } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Group, Note } from './Group'
import { setSelection, useSelection } from './selection'
import { useJobChoices } from './useJobChoices'

const detail = (j: JobListing): string =>
  [j.company, j.score !== null ? `fit ${j.score.toFixed(1)}` : null, j.reportPath ? 'report ready' : 'evaluated', j.state === 'interview' ? 'interview stage' : null].filter(Boolean).join(' · ')

/** Every session belongs to a job: there is no "no job" choice. */
export function JobPicker({ summary }: { summary?: React.ReactNode }) {
  const { jobs, loading } = useJobChoices()
  const { jobId } = useSelection()
  return (
    <Group title="Job" action={<Button size="sm" variant="outline" onClick={() => navigate('jobs')}>Add a job</Button>}>
      {loading ? <p className="m-0 text-sm text-muted-foreground">Loading your jobs…</p>
        : jobs.length === 0 ? <Note>No evaluated jobs yet. Evaluate a job in Jobs first: the copilot prepares from its report.</Note>
        : (
          <div role="radiogroup" aria-label="Job" className="grid gap-2 sm:grid-cols-2">
            {jobs.map(j => (
              <button key={j.id} type="button" role="radio" aria-checked={j.id === jobId} onClick={() => setSelection({ jobId: j.id })}
                className={cn('flex min-w-0 flex-col gap-0.5 rounded-lg border p-3 text-left outline-none transition-colors focus-visible:ring-[3px] focus-visible:ring-ring/50', j.id === jobId ? 'border-primary bg-primary/5' : 'border-border hover:bg-accent/40')}>
                <span className="truncate text-sm font-semibold text-foreground">{j.title}</span>
                <span className="truncate text-xs text-muted-foreground">{detail(j)}</span>
              </button>
            ))}
          </div>
        )}
      {summary}
    </Group>
  )
}
