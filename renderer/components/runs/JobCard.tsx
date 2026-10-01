import { Button } from '@/components/ui/button'
import { ScoreBadge, StageBadge } from '../Badges'
import { openJob } from '../../lib/jobNav'
import type { JobListing, Run } from '../../lib/types'

const dateOf = (iso: string | null) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(iso).toLocaleDateString() : null)

/** The job a run was about, read-only (the Job page owns every edit), and that job's runs as a timeline. */
export function JobCard({ job, runs, current, onSelectRun }: { job: JobListing; runs: Run[]; current: string; onSelectRun: (id: string) => void }) {
  const facts: Array<[string, string | null]> = [
    ['Location', job.location], ['ATS', job.ats], ['Posted', dateOf(job.postedAt)], ['Evaluated', dateOf(job.evaluatedAt)],
    ['Trust', job.trustScore === null ? null : String(job.trustScore)], ['Report', job.reportNum === null ? null : `#${job.reportNum}`],
  ]
  return (
    <section aria-label={`Job ${job.title} — ${job.company}`} className="flex flex-col gap-2 rounded-lg border border-border bg-[var(--card-inner)] p-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="min-w-0 flex-1">
          <b className="block truncate text-sm">{job.title}</b>
          <span className="text-xs text-muted-foreground">{job.company}</span>
        </div>
        <ScoreBadge score={job.score} />
        {job.status ? <StageBadge status={job.status} /> : <span className="stage">{job.state}</span>}
        {job.stale && <span className="stage" title="Evaluated before your résumé last changed">stale</span>}
        <Button size="sm" variant="outline" onClick={() => openJob(job.id)}>Open job</Button>
        <Button size="sm" variant="outline" disabled={job.reportNum === null} title={job.reportNum === null ? 'Not evaluated yet' : undefined} onClick={() => openJob(job.id, 'match')}>Open match</Button>
      </div>
      <dl className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-xs">
        {facts.filter(([, v]) => v).map(([k, v]) => <div key={k} className="flex gap-1"><dt className="text-muted-foreground">{k}</dt><dd className="m-0">{v}</dd></div>)}
      </dl>
      {runs.length > 1 && (
        <ol aria-label="This job's runs" className="m-0 flex list-none flex-wrap gap-1 p-0">
          {runs.map(r => (
            <li key={r.id}>
              <button
                type="button" aria-current={r.id === current ? 'true' : undefined} onClick={() => onSelectRun(r.id)}
                className={`cursor-pointer rounded-full border px-2 py-0.5 text-[11px] ${r.id === current ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_10%,transparent)]' : 'border-border bg-transparent hover:bg-muted'}`}
              >
                {r.label.replace(/^Evaluate .* — .*$/, 'Evaluate')} · {r.status}
              </button>
            </li>
          ))}
        </ol>
      )}
    </section>
  )
}
