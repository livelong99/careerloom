import { useState } from 'react'
import { ArrowUpRight, ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import { careerloom, normalizeCliError } from '../../lib/ipc'
import { neighbours, openJob } from '../../lib/jobNav'
import { showToast } from '../../lib/toast'
import type { JobView } from '../../lib/types'
import { CANONICAL_STATUSES, stateLabel, type ScreenedJob } from '../jobs/filters'
import { FeedbackButtons, ScreenBadge, useUnlikelyGuard } from '../jobs/prescreen'
import { useEvaluateOne } from './useJob'

function ScoreRing({ score }: { score: number | null }) {
  const r = 22, c = 2 * Math.PI * r
  const tone = score === null ? 'text-muted-foreground' : score >= 4 ? 'text-success' : score >= 3 ? 'text-warning' : 'text-destructive'
  return (
    <div className={`relative h-14 w-14 shrink-0 ${tone}`} role="img" aria-label={score === null ? 'Not scored' : `Score ${score.toFixed(1)} out of 5`}>
      <svg viewBox="0 0 56 56" className="h-full w-full -rotate-90">
        <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeOpacity="0.15" strokeWidth="5" />
        {score !== null && <circle cx="28" cy="28" r={r} fill="none" stroke="currentColor" strokeWidth="5" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - score / 5)} />}
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-sm font-semibold tabular-nums text-foreground">{score === null ? '—' : score.toFixed(1)}</span>
    </div>
  )
}

type Props = { job: ScreenedJob; view: JobView | null | undefined; onBack: () => void; onChanged: () => void; onScreened: (e: ScreenedJob['screen'] | null) => void }

export function JobHeader({ job, view, onBack, onChanged, onScreened }: Props) {
  const ev = useEvaluateOne(job.id)
  const { guard, dialog } = useUnlikelyGuard(ids => ev.start(ids, job.reportNum !== null))
  const [statusOpen, setStatusOpen] = useState(false)
  const nb = neighbours(job.id)
  const evaluated = job.reportNum !== null
  const setStatus = async (status: (typeof CANONICAL_STATUSES)[number]) => {
    setStatusOpen(false)
    try {
      const res = await careerloom.setStatus([job.reportNum!], status)
      if (res.failed.length) showToast(res.failed[0]!.error, 'error', 6000)
      else showToast(`Moved to ${status}`)
      onChanged()
    } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) }
  }
  const legit = view?.report?.legitimacy
  return (
    <header className="space-y-3">
      <nav className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground" aria-label="Breadcrumb">
        <Button variant="ghost" size="sm" className="h-8 gap-1 px-2" onClick={onBack}><ChevronLeft className="h-4 w-4" />Back to Jobs</Button>
        <span className="min-w-0 truncate">Jobs › {job.company || 'Unknown'} — {job.title || 'Untitled'}</span>
        <span className="ml-auto flex items-center gap-1">
          {nb.index >= 0 && <span className="text-xs tabular-nums">{nb.index + 1} / {nb.total}</span>}
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={!nb.prev} aria-label="Previous job" onClick={() => nb.prev && openJob(nb.prev)}><ChevronLeft className="h-4 w-4" /></Button>
          <Button variant="outline" size="icon" className="h-8 w-8" disabled={!nb.next} aria-label="Next job" onClick={() => nb.next && openJob(nb.next)}><ChevronRight className="h-4 w-4" /></Button>
        </span>
      </nav>
      <div className="flex flex-wrap items-start gap-4">
        <ScoreRing score={job.score} />
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate text-lg font-semibold text-foreground">{job.title || 'Untitled posting'}</h2>
          <p className="m-0 text-sm text-muted-foreground">{[job.company, job.location, job.postedAt && `posted ${job.postedAt}`, job.ats].filter(Boolean).join(' · ')}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <span className={`stage stage-${job.state}`}>{job.status && job.state !== 'evaluated' ? job.status : stateLabel(job.state)}</span>
            {job.screen && <ScreenBadge entry={job.screen} />}
            {legit && <Badge variant={/high/i.test(legit) ? 'success' : /low|suspicious/i.test(legit) ? 'danger' : 'warn'}>{legit}</Badge>}
            {job.stale && <Badge variant="warn" title="Evaluated before your résumé last changed">Out of date vs your résumé</Badge>}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {ev.running
            ? <Button size="sm" disabled className="gap-2"><Loader2 className="h-4 w-4 animate-spin" />Evaluating…</Button>
            : job.url && <Button size="sm" onClick={() => void guard([job])}>{evaluated ? 'Re-evaluate' : 'Evaluate'}</Button>}
          {job.url && <Button size="sm" variant="outline" className="gap-1" onClick={() => void careerloom.openExternal(job.url)}>Open posting <ArrowUpRight className="h-3.5 w-3.5" /></Button>}
          {evaluated && (
            <Popover open={statusOpen} onOpenChange={setStatusOpen}>
              <PopoverTrigger asChild><Button size="sm" variant="secondary">Stage: {job.status ?? '—'}</Button></PopoverTrigger>
              <PopoverContent className="w-40 p-1" align="end">
                {CANONICAL_STATUSES.map(s => (
                  <button key={s} type="button" className="flex w-full cursor-pointer rounded-(--rad-4) px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-(--accent-text)" onClick={() => void setStatus(s)}>{s}</button>
                ))}
              </PopoverContent>
            </Popover>
          )}
          <FeedbackButtons job={job} onChange={onScreened} />
        </div>
      </div>
      {ev.running && <p className="m-0 truncate text-xs text-muted-foreground" role="status">{ev.last || 'One headless worker is reading the posting and your résumé…'}</p>}
      {dialog}
    </header>
  )
}
