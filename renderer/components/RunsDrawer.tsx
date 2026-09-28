import { useEffect, useRef, useState } from 'react'

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet'
import { usePolled } from '../hooks/usePolled'
import { useRuns } from '../hooks/useRuns'
import { careerloom, normalizeCliError } from '../lib/ipc'
import { showToast } from '../lib/toast'
import type { Run } from '../lib/types'
import { EmptyNote } from './EmptyState'
import { ListRow } from './ListRow'

/** Dispatch on window to open the drawer from anywhere (e.g. right after starting a skill). */
export const OPEN_RUNS_EVENT = 'careerloom:open-runs'
/** Agent screen opens this thread on mount (set by "Continue in chat"). */
export const OPEN_THREAD_KEY = 'careerloom.openThread'
/** `id` focuses that run's log (e.g. "View log" on a past scan). */
export const openRuns = (id?: unknown) => window.dispatchEvent(new CustomEvent<string | undefined>(OPEN_RUNS_EVENT, { detail: typeof id === 'string' ? id : undefined }))

/** Every skill run, whichever screen started it: history on top, live log below.
 *  Opened from the top bar; replaces the old Runs screen's log pane. */
export function RunsDrawer({ open, onOpenChange, focusId }: { open: boolean; onOpenChange: (open: boolean) => void; focusId?: string | null }) {
  const { runs, logs, cancel } = useRuns()
  const [selected, setSelected] = useState<string | null>(null)
  useEffect(() => { if (focusId) setSelected(focusId) }, [focusId])
  const active = runs.find(r => r.id === selected) ?? runs[0] ?? null

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-[min(640px,92vw)] sm:max-w-none flex flex-col gap-3 p-4">
        <SheetHeader className="p-0">
          <SheetTitle>Runs</SheetTitle>
          <SheetDescription>Everything the agent and career-ops scripts did this session and before.</SheetDescription>
        </SheetHeader>
        {runs.length === 0
          ? <EmptyNote>Nothing has run yet.</EmptyNote>
          : (
            <div className="max-h-[40%] overflow-y-auto rounded-md border border-border">
              {runs.map(r => (
                <ListRow
                  key={r.id}
                  title={r.label}
                  sub={`${new Date(r.startedAt).toLocaleString()}${r.input ? ` · ${r.input.slice(0, 48)}` : ''}`}
                  value={<span className={`run-status ${r.status}`}>{r.status}</span>}
                  onClick={() => setSelected(r.id)}
                  expanded={r.id === active?.id}
                />
              ))}
            </div>
          )}
        {active && <RunLog run={active} log={logs[active.id]} onCancel={cancel} />}
      </SheetContent>
    </Sheet>
  )
}

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
          {run.status !== 'running' && ['claude', 'antigravity', 'opencode', 'zen'].includes(run.runner) && run.sessionId && (
            <button type="button" className="btnp" onClick={() => void continueInChat(run.id)}>Continue in chat</button>
          )}
          {run.status === 'running'
            ? <button type="button" className="btnp" onClick={() => onCancel(run.id)}>Stop</button>
            : <span className={`run-status ${run.status}`}>{run.status}</span>}
        </span>
      </div>
      <pre ref={pre} className="log min-h-0 flex-1" style={{ maxHeight: 'none' }} aria-live="polite">{text || 'Starting…'}</pre>
    </div>
  )
}

/** Open the run as an Agent chat so the user can answer what it asked. */
async function continueInChat(runId: string): Promise<void> {
  try {
    const thread = await careerloom.continueRun(runId)
    try { sessionStorage.setItem(OPEN_THREAD_KEY, thread.id) } catch { /* storage can be unavailable */ }
    window.dispatchEvent(new CustomEvent('careerloom:navigate', { detail: 'agent' }))
  } catch (err) {
    showToast(normalizeCliError(err).message, 'error', 6000)
  }
}
