import { useState } from 'react'
import { ArrowUpRight } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from '@/components/ui/sheet'

import type { Portal } from '../../lib/types'
import { careerloom } from '../../lib/ipc'
import { useEvaluateJobs } from './BulkBar'
import type { ScreenedJob } from './filters'
import { StatePill } from './JobsTable'
import { FeedbackButtons, ScreenBadge, useUnlikelyGuard } from './prescreen'

/** Lightweight detail for jobs without a report yet (new / queued). */
export function JobSheet({ job: initial, portals, onClose, onScreened }: { job: ScreenedJob; portals: Portal[]; onClose: () => void; onScreened?: () => void }) {
  const [job, setJob] = useState(initial)
  const evaluateJobs = useEvaluateJobs()
  const { guard, dialog } = useUnlikelyGuard(ids => evaluateJobs(ids), onClose)
  const portal = portals.find(p => p.id === job.portalId)
  const rows: Array<[string, string | null]> = [
    ['Portal', portal ? `${portal.name}${portal.ats ? ` (${portal.ats})` : ''}` : 'Pasted link'],
    ['Location', job.location],
    ['Posted', job.postedAt],
    ['First seen', job.firstSeen],
    ['Trust', job.trustFlags.length ? `${job.trustScore ?? '—'}/100 · ${job.trustFlags.join(', ')}` : null],
  ]
  return (
    <Sheet open onOpenChange={open => { if (!open) onClose() }}>
      <SheetContent className="sm:max-w-md">
        <SheetHeader>
          <SheetTitle>{job.title || 'Untitled posting'}</SheetTitle>
          <SheetDescription>{job.company || 'Unknown company'}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 px-4">
          <div className="flex items-center gap-2"><StatePill job={job} /><ScreenBadge entry={job.screen} /></div>
          {job.screen && <p className="text-sm text-muted-foreground">Pre-screen: {job.screen.reason}</p>}
          <FeedbackButtons job={job} onChange={e => { setJob(j => ({ ...j, screen: e ?? undefined })); onScreened?.() }} />
          <dl className="grid grid-cols-[7rem_1fr] gap-y-2 text-sm">
            {rows.map(([k, v]) => [
              <dt key={`${k}-k`} className="text-muted-foreground">{k}</dt>,
              <dd key={`${k}-v`} className="break-words">{v || '—'}</dd>,
            ])}
          </dl>
          {job.state === 'queued' && <p className="text-sm text-muted-foreground">In career-ops' pending list. Evaluate it here to score just this job.</p>}
        </div>
        <SheetFooter className="flex-row gap-2">
          {job.url && (
            <Button variant="outline" size="sm" className="gap-1" onClick={() => void careerloom.openExternal(job.url)}>
              Open posting <ArrowUpRight className="h-3.5 w-3.5" />
            </Button>
          )}
          {job.url && <Button size="sm" onClick={() => void guard([job]).then(ok => { if (ok) onClose() })}>Evaluate</Button>}
          {dialog}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
