import { useEffect, useMemo, useRef, useState } from 'react'

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { canContinue } from '../RunLog'
import { useRuns } from '../../hooks/useRuns'
import { careerloom, normalizeCliError } from '../../lib/ipc'
import { formatCompact, formatDuration, formatUsd } from '../../lib/format'
import { continueInChat, navigate } from '../../lib/nav'
import { openJob } from '../../lib/jobNav'
import { elapsedMs, logSteps, runLinks } from '../../lib/runsView'
import type { JobListing, Run } from '../../lib/types'
import { LogViewer } from './LogViewer'

const LOG_THROTTLE_MS = 500
const RERUN_RUNNERS = new Set(['claude', 'codex', 'antigravity', 'opencode', 'zen', 'api'])

/** The run's redacted log from the main process. A running run re-reads it as chunks arrive (at most every
 *  LOG_THROTTLE_MS), so it follows the live stream without a timer that a hidden window would pause. */
function useRunLog(run: Run): { text: string; error: string | null } {
  const live = useRuns().logs[run.id]?.length ?? 0
  const [state, setState] = useState({ text: '', error: null as string | null })
  const last = useRef(0)
  useEffect(() => {
    let alive = true
    const load = () => {
      last.current = Date.now()
      careerloom.getRunLog(run.id).then(text => { if (alive) setState({ text, error: null }) }, err => { if (alive) setState(s => ({ ...s, error: normalizeCliError(err).message })) })
    }
    const timer = setTimeout(load, Math.max(0, last.current + LOG_THROTTLE_MS - Date.now()))
    return () => { alive = false; clearTimeout(timer) }
  }, [run.id, run.status, live])
  return state
}

/** Ticks once a second while `active`, so a running run's elapsed time moves. */
export function useNow(active: boolean): number {
  const [now, setNow] = useState(Date.now)
  useEffect(() => {
    if (!active) return
    const id = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(id)
  }, [active])
  return active ? now : Date.now()
}

type Props = {
  run: Run
  jobs: Pick<JobListing, 'id' | 'url' | 'reportNum'>[]
  /** Career-ops modes the agent can start again (null while unknown). */
  modes: string[] | null
  onStop: (id: string) => void
  onRerun: (run: Run) => void
  onDelete: (run: Run) => Promise<void>
}

export function RunDetail({ run, jobs, modes, onStop, onRerun, onDelete }: Props) {
  const running = run.status === 'running'
  const now = useNow(running)
  const log = useRunLog(run)
  const text = log.text
  const steps = useMemo(() => logSteps(text), [text])
  const [jump, setJump] = useState<{ line: number; n: number } | null>(null)
  const [confirm, setConfirm] = useState(false)
  const links = runLinks(run, jobs)
  const tokens = run.usage ? run.usage.inputTokens + run.usage.outputTokens : 0
  const canRerun = !running && RERUN_RUNNERS.has(run.runner) && !!modes?.includes(run.mode)

  return (
    <section className="flex min-h-0 flex-1 flex-col gap-3 p-4" aria-label={`Run ${run.label}`}>
      <header className="flex flex-wrap items-start gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1">
          <h2 className="m-0 truncate text-base font-semibold">{run.label}</h2>
          <p className="m-0 mt-0.5 text-xs text-muted-foreground">
            {run.runner} · {run.mode} · started {new Date(run.startedAt).toLocaleString()}
          </p>
        </div>
        <span className={`run-status ${run.status}`}>{run.status}</span>
      </header>

      <dl className="m-0 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <Fact label={running ? 'Elapsed' : 'Duration'} value={formatDuration(elapsedMs(run, now))} />
        <Fact label="Steps" value={String(steps.filter(s => s.kind === 'tool').length)} />
        <Fact label="Tokens" value={run.usage ? formatCompact(tokens) : '—'} />
        <Fact label="Cost" value={run.usage?.costUsd != null ? formatUsd(run.usage.costUsd) : '—'} />
      </dl>

      {run.input && (
        <details className="rounded-lg border border-border bg-[var(--card-inner)] px-3 py-2 text-sm">
          <summary className="cursor-pointer text-xs font-medium text-muted-foreground">Prompt / input</summary>
          <p className="m-0 mt-2 max-h-40 overflow-auto text-xs break-words whitespace-pre-wrap">{run.input}</p>
        </details>
      )}

      <div className="flex flex-wrap items-center gap-2">
        {running && <Button size="sm" variant="destructive" onClick={() => onStop(run.id)}>Stop</Button>}
        {canRerun && <Button size="sm" variant="outline" onClick={() => onRerun(run)}>Re-run</Button>}
        {!running && canContinue(run) && <Button size="sm" variant="outline" onClick={() => void continueInChat(run.id)}>Continue in chat</Button>}
        {links.jobId && <Button size="sm" variant="outline" onClick={() => openJob(links.jobId!)}>Open job</Button>}
        {links.resume && <Button size="sm" variant="outline" onClick={() => navigate('resume')}>Open resume</Button>}
        {links.boards && <Button size="sm" variant="outline" onClick={() => navigate('boards')}>Open boards</Button>}
        <span className="flex-1" />
        <Button size="sm" variant="ghost" disabled={running} title={running ? 'Stop the run before deleting it' : undefined} onClick={() => setConfirm(true)}>Delete</Button>
      </div>

      {steps.length > 0 && (
        <ol aria-label="Steps" className="m-0 flex max-h-28 list-none flex-col gap-0.5 overflow-auto rounded-lg border border-border p-1 text-xs">
          {steps.map(s => (
            <li key={s.line}>
              <button type="button" onClick={() => setJump(j => ({ line: s.line, n: (j?.n ?? 0) + 1 }))} className="flex w-full cursor-pointer items-center gap-2 rounded border-0 bg-transparent px-2 py-0.5 text-left hover:bg-muted">
                <span aria-hidden="true" className={s.kind === 'tool' ? 'text-[var(--accent-text)]' : s.kind === 'ok' ? 'text-[var(--ok)]' : 'text-[var(--bad)]'}>{s.kind === 'tool' ? '▸' : s.kind === 'ok' ? '✓' : '✗'}</span>
                <span className="truncate">{s.text}</span>
                <span className="ml-auto text-muted-foreground">line {s.line + 1}</span>
              </button>
            </li>
          ))}
        </ol>
      )}

      {log.error
        ? <p role="alert" className="text-sm text-[var(--bad)]">Could not load the log: {log.error}</p>
        : <LogViewer text={text} name={`${run.mode}-${run.id.slice(0, 8)}`} jumpTo={jump} placeholder={running ? 'Starting…' : 'No log was kept for this run — only scan logs survive a restart.'} />}

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this run?</AlertDialogTitle>
            <AlertDialogDescription>“{run.label}” and its saved log are removed. Totals on the Monitoring page will no longer count it.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onDelete(run)}>Delete run</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  )
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-[var(--card-inner)] px-3 py-2">
      <dt className="text-[11px] text-muted-foreground">{label}</dt>
      <dd className="m-0 text-sm font-medium tabular-nums">{value}</dd>
    </div>
  )
}
