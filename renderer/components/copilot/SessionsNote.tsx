import { History } from 'lucide-react'

import { careerloom } from '@/lib/ipc'
import { useAsync } from './api'
import { gotoPage } from './selection'

/** "Every session belongs to a job. 3 earlier sessions for X (2 practice, 1 live), best score 3.9 / 5." */
export function SessionsNote({ jobId, title }: { jobId: string; title?: string }) {
  const { data } = useAsync(() => careerloom.copilotSessionsForJob(jobId), [jobId])
  const list = data?.sessions ?? []
  const live = list.filter(s => s.mode === 'live').length
  const best = list.reduce<number | null>((m, s) => (s.score !== null && (m === null || s.score > m) ? s.score : m), null)
  return (
    <div role="note" className="mt-3 flex items-start gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
      <History className="mt-0.5 size-4 shrink-0" aria-hidden />
      <div>
        Every session belongs to a job.{' '}
        {list.length === 0 ? <>No earlier sessions{title ? <> for <b className="text-foreground">{title}</b></> : null}.</>
          : <><b className="text-foreground">{list.length} earlier {list.length === 1 ? 'session' : 'sessions'}</b>{title ? <> for {title}</> : null} ({list.length - live} practice, {live} live){best !== null ? <>, best score <b className="text-foreground">{best.toFixed(1)} / 5</b></> : null}.{' '}
            <button type="button" className="text-brand-text underline-offset-2 hover:underline" onClick={() => gotoPage('sessions')}>View sessions</button></>}
      </div>
    </div>
  )
}
