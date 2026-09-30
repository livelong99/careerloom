import { CheckCircle2, TriangleAlert } from 'lucide-react'

import type { PermStatus } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Group } from './Group'
import { gotoPage } from './selection'

type Item = { ok: boolean; text: string }
const permText = (what: string, s: PermStatus): Item =>
  s === 'granted' ? { ok: true, text: `${what} allowed` } : s === 'denied' || s === 'restricted' ? { ok: false, text: `${what} blocked: allow it in System Settings` } : { ok: false, text: `${what} not asked yet` }

export type ReadinessView = { hasReport: boolean; hasPosting: boolean; hasCv: boolean; mic: PermStatus; system: PermStatus; stt: 'ready' | 'not-installed'; engine: 'ready' | 'no-key' }

export function readinessItems(r: ReadinessView): Item[] {
  return [
    { ok: r.hasReport || r.hasPosting, text: r.hasReport ? 'Job context loaded' : r.hasPosting ? 'Job posting loaded (no evaluation report yet)' : 'No posting or report for this job yet' },
    { ok: r.hasCv, text: r.hasCv ? 'Résumé found' : 'No résumé (cv.md) yet' },
    permText('Microphone', r.mic),
    r.system === 'granted' ? { ok: true, text: 'System audio allowed' } : { ok: false, text: 'System audio needs permission' },
    { ok: r.stt === 'ready', text: r.stt === 'ready' ? 'Speech model installed' : 'Speech model not installed yet' },
    { ok: r.engine === 'ready', text: r.engine === 'ready' ? 'Answer engine key saved' : 'Answer engine needs an OpenRouter key' },
  ]
}

export function ReadinessStrip({ readiness }: { readiness: ReadinessView | null }) {
  if (!readiness) return <Group><p className="m-0 text-sm text-muted-foreground">Pick a job to check what is ready.</p></Group>
  return (
    <Group>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <ul aria-label="Readiness" className="m-0 flex list-none flex-col gap-1 p-0 text-sm">
          {readinessItems(readiness).map(i => (
            <li key={i.text} className={cn('flex items-center gap-2', i.ok ? 'text-(--status-task-done)' : 'text-warning')}>
              {i.ok ? <CheckCircle2 className="size-3.5" aria-hidden /> : <TriangleAlert className="size-3.5" aria-hidden />}
              <span><span className="sr-only">{i.ok ? 'Ready: ' : 'Needs attention: '}</span>{i.text}</span>
            </li>
          ))}
        </ul>
        <p className="m-0 max-w-64 text-right text-xs text-muted-foreground">
          Practice and mic-only live sessions work now.{' '}
          <button type="button" className="text-brand-text underline-offset-2 hover:underline" onClick={() => gotoPage('audio')}>Fix system audio</button> to hear the interviewer.
        </p>
      </div>
    </Group>
  )
}
