import { useEffect, useState } from 'react'

import { careerloom } from '../../lib/ipc'
import type { BootstrapStatus, BootstrapStep, BootstrapStepId } from '../../lib/types'
import { BTN } from '../onboarding/parts'

const ICON: Record<BootstrapStep['state'], string> = { pending: '○', running: '◐', done: '✓', failed: '✕', skipped: '–' }
const TONE: Record<BootstrapStep['state'], string> = { pending: 'text-muted-foreground', running: 'text-[var(--accent)]', done: 'text-emerald-600 dark:text-emerald-400', failed: 'text-destructive', skipped: 'text-muted-foreground' }
const STATE_TEXT: Record<BootstrapStep['state'], string> = { pending: 'Waiting', running: 'Installing', done: 'Installed', failed: 'Failed', skipped: 'Skipped' }
const size = (mb: number) => (mb >= 1024 ? `${(mb / 1024).toFixed(1)} GB` : `${mb} MB`)

/** Last lines of the running step's log (polled lightly while it runs). */
function LogPeek({ runId }: { runId: string }) {
  const [text, setText] = useState('')
  useEffect(() => {
    let live = true
    const load = () => careerloom.runLogTail(runId, 4).then(t => { if (live) setText(t) }, () => {})
    void load()
    const id = setInterval(load, 2000)
    return () => { live = false; clearInterval(id) }
  }, [runId])
  return text ? <pre className="m-0 max-h-20 overflow-hidden whitespace-pre-wrap break-all rounded-md border border-border bg-background px-2 py-1 font-mono text-[length:var(--fs-meta)] text-muted-foreground">{text}</pre> : null
}

function FailureBox({ step, onRetry, onSkip }: { step: BootstrapStep; onRetry: () => void; onSkip?: () => void }) {
  const [copied, setCopied] = useState(false)
  const err = step.error
  if (!err) return null
  const copy = () => void navigator.clipboard.writeText(err.prompt).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2000) }, () => {})
  return (
    <div role="alert" className="flex flex-col gap-2 rounded-md border border-destructive/50 p-3 text-[length:var(--fs-meta)]">
      <span className="text-destructive">{err.message}</span>
      {err.logTail && <pre className="m-0 max-h-32 overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-background px-2 py-1 font-mono">{err.logTail}</pre>}
      <span className="text-muted-foreground">Paste the fix prompt into any agent CLI (Claude Code, Codex, Antigravity, OpenCode); it can repair this for you. Then press Retry.</span>
      <div className="flex flex-wrap gap-2">
        <button type="button" className={BTN} onClick={copy}>{copied ? 'Copied' : 'Copy fix prompt'}</button>
        <button type="button" className={BTN} onClick={onRetry}>Retry</button>
        {onSkip && <button type="button" className={BTN} onClick={onSkip}>Skip for now</button>}
      </div>
    </div>
  )
}

function StepRow({ step, onRetry, onSkip }: { step: BootstrapStep; onRetry: (id: BootstrapStepId) => void; onSkip: (id: BootstrapStepId) => void }) {
  return (
    <li className="flex flex-col gap-2 border-b border-border py-3 last:border-b-0" data-step={step.id} data-state={step.state}>
      <div className="flex items-baseline gap-3">
        <span aria-hidden="true" className={`w-4 text-center ${TONE[step.state]}`}>{ICON[step.state]}</span>
        <b className="font-medium text-foreground">{step.label}</b>
        {step.sizeMb != null && step.state !== 'done' && <span className="text-[length:var(--fs-meta)] text-muted-foreground">{size(step.sizeMb)} download</span>}
        <span className={`ml-auto text-[length:var(--fs-meta)] ${TONE[step.state]}`}>{STATE_TEXT[step.state]}</span>
      </div>
      {step.state === 'running' && step.detail && <span className="pl-7 text-[length:var(--fs-meta)] text-muted-foreground">{step.detail}</span>}
      <div className="pl-7">
        {step.state === 'running' && step.runId && <LogPeek runId={step.runId} />}
        {step.state === 'failed' && <FailureBox step={step} onRetry={() => onRetry(step.id)} onSkip={step.core ? undefined : () => onSkip(step.id)} />}
      </div>
    </li>
  )
}

/** One list of install steps: core steps gate setup, the rest install in the background. */
export function BootstrapPanel({ status, onRetry }: { status: BootstrapStatus; onRetry: (id: BootstrapStepId) => void }) {
  const [skipped, setSkipped] = useState<ReadonlySet<BootstrapStepId>>(new Set())
  const skip = (id: BootstrapStepId) => setSkipped(prev => new Set(prev).add(id))
  const steps = status.steps.filter(s => !skipped.has(s.id))
  const core = steps.filter(s => s.core)
  const rest = steps.filter(s => !s.core)
  const done = core.filter(s => s.state === 'done').length
  const summary = status.coreDone ? 'Everything required is installed.' : `Installing ${done} of ${core.length} required tools…`
  const list = (items: BootstrapStep[]) => <ul className="m-0 list-none p-0">{items.map(s => <StepRow key={s.id} step={s} onRetry={onRetry} onSkip={skip} />)}</ul>
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <progress className="h-2 w-full" max={core.length || 1} value={done} aria-label="Setup progress" />
        <p className="m-0 text-[length:var(--fs-meta)] text-muted-foreground" role="status" aria-live="polite">{summary}</p>
      </div>
      {list(core)}
      {rest.length > 0 && (
        <section aria-label="Installing in the background" className="flex flex-col gap-1">
          <h3 className="m-0 text-[length:var(--fs-meta)] font-semibold uppercase tracking-wide text-muted-foreground">Installing in the background</h3>
          <p className="m-0 text-[length:var(--fs-meta)] text-muted-foreground">Optional. You can keep going; these finish on their own.</p>
          {list(rest)}
        </section>
      )}
    </div>
  )
}
