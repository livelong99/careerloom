import { useEffect, useRef } from 'react'

import { usePolled } from '../hooks/usePolled'
import { careerloom } from '../lib/ipc'
import { continueInChat } from '../lib/nav'
import type { Run } from '../lib/types'

/** Compact run log with Stop / Continue-in-chat (used by onboarding; the Runs page has the full viewer). */
export function RunLog({ run, log, onCancel }: { run: Run; log: string | undefined; onCancel: (id: string) => void }) {
  const pre = useRef<HTMLPreElement>(null)
  // Runs from before this window opened only have the main-process copy.
  const backfill = usePolled(() => (log === undefined ? careerloom.getRunLog(run.id) : Promise.resolve('')), [run.id, log === undefined], { intervalMs: null })
  const text = log ?? backfill.data ?? ''
  useEffect(() => { pre.current?.scrollTo({ top: pre.current.scrollHeight }) }, [text])

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex items-center justify-between">
        <b>{run.label}</b>
        <span className="flex items-center gap-2">
          {run.status !== 'running' && canContinue(run) && <button type="button" className="btnp" onClick={() => void continueInChat(run.id)}>Continue in chat</button>}
          {run.status === 'running'
            ? <button type="button" className="btnp" onClick={() => onCancel(run.id)}>Stop</button>
            : <span className={`run-status ${run.status}`}>{run.status}</span>}
        </span>
      </div>
      <pre ref={pre} className="log min-h-0 flex-1" style={{ maxHeight: 'none' }} aria-live="polite">{text || 'Starting…'}</pre>
    </div>
  )
}

/** Only chat-capable runners that kept a session can carry on as a conversation. */
export const canContinue = (run: Pick<Run, 'runner' | 'sessionId'>) => ['claude', 'antigravity', 'opencode', 'zen'].includes(run.runner) && !!run.sessionId
