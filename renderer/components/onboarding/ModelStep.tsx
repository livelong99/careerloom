import { useEffect, useState } from 'react'

import { usePolled } from '../../hooks/usePolled'
import { useRuns } from '../../hooks/useRuns'
import { careerloom } from '../../lib/ipc'
import type { LocalModelStatus } from '../../lib/types'
import { ThirdPartyNotices } from './notices'
import { BTN, Command, Download, ErrorLine, Footer, LINK, LiveRun, PRIMARY, StepHeader, errorText } from './parts'

// The optional local pre-screen model: download + install with live steps. Used by onboarding,
// Settings and the Jobs pre-screen popover.

const STEPS = ['Python', 'Packages', 'Model', 'Self-test'] as const

const platformName = (s: LocalModelStatus) =>
  s.platform === 'darwin' ? `Mac (${s.arch === 'arm64' ? 'Apple silicon' : 'Intel'})` : s.platform === 'win32' ? `Windows (${s.arch})` : `${s.platform} (${s.arch})`

/** Current step from the install log's "▸ <Step>" headers. */
function stepIndex(log: string | undefined): number {
  const hits = [...(log ?? '').matchAll(/▸ ([\w-]+)/g)].map(m => STEPS.indexOf(m[1] as typeof STEPS[number]))
  return hits.length ? Math.max(...hits) : 0
}

/** Status, Python check, "Download and install" with its steps and log. `onStatus` gets each fresh status. */
export function LocalModelSetup({ onStatus }: { onStatus?: (s: LocalModelStatus) => void }) {
  const { runs, logs, adopt } = useRuns()
  const [tick, setTick] = useState(0)
  const [started, setStarted] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pre = usePolled(() => careerloom.localModelStatus(), [tick], { intervalMs: null })
  const s = pre.data
  const runId = started ?? s?.installRun ?? null
  const run = runs.find(r => r.id === runId)
  const running = run?.status === 'running'
  useEffect(() => { if (run && run.status !== 'running') setTick(n => n + 1) }, [run?.status]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (s) onStatus?.(s) }, [s]) // eslint-disable-line react-hooks/exhaustive-deps

  const install = async () => {
    setError(null)
    try { const r = await careerloom.installLocalModel(); adopt(r); setStarted(r.id) } catch (err) { setError(errorText(err)) }
  }

  if (!s) return pre.error ? <ErrorLine message={`Couldn’t check the local model: ${errorText(pre.error)}`} /> : <p className="m-0 text-muted-foreground">Checking…</p>
  const at = run?.status === 'done' ? STEPS.length : stepIndex(runId ? logs[runId] : undefined)
  const total = s.downloadGb.packages + s.downloadGb.weights

  return (
    <div className="flex flex-col gap-3 text-[length:var(--fs-meta)]">
      <p className="m-0 text-muted-foreground">
        Pre-screens jobs on your computer — job titles never leave it. {s.installed ? <b className="text-success">Installed.</b> : <>Detected: {platformName(s)}. Download: about {s.downloadGb.packages} GB of packages + {s.downloadGb.weights} GB model ≈ {total.toFixed(1)} GB on disk (approximate).</>}
      </p>
      {!s.python && !s.installed && (
        <div className="flex flex-col gap-2 rounded-md border border-border p-3">
          <span className="text-warning">{s.oldPython ? `Python ${s.oldPython} is too old — the local model needs Python 3.10 or newer.` : 'Python 3.10 or newer wasn’t found.'}</span>
          {s.platform === 'win32' && <Command cmd="winget install Python.Python.3.12" />}
          {s.platform === 'darwin' && <Command cmd="brew install python@3.12" />}
          <div className="flex gap-2">
            <Download label="Download Python" url="https://www.python.org/downloads/" />
            <button type="button" className={BTN} disabled={pre.loading} onClick={() => setTick(n => n + 1)}>{pre.loading ? 'Checking…' : 'Check again'}</button>
          </div>
        </div>
      )}
      <ThirdPartyNotices />
      {runId && (
        <ol className="m-0 flex list-none gap-4 p-0" aria-label="Install steps">
          {STEPS.map((label, i) => (
            <li key={label} className={i < at ? 'text-success' : i === at && running ? 'font-semibold text-foreground' : 'text-muted-foreground'}>
              {i < at ? '✓ ' : ''}{label}
            </li>
          ))}
        </ol>
      )}
      {runId && <LiveRun id={runId} />}
      {run?.status === 'failed' && <ErrorLine message="The install didn’t finish. The log above says why — check your connection, then try again." />}
      <ErrorLine message={error} />
      {!s.installed && s.python && (
        <button type="button" className={`${PRIMARY} self-start`} disabled={running} onClick={() => void install()}>
          {running ? 'Installing…' : run ? 'Try again' : 'Download and install'}
        </button>
      )}
    </div>
  )
}

/** Onboarding: optional — skipping keeps the rule-based pre-screen; an install keeps going if they move on. */
export function ModelStep({ onNext }: { onNext: () => void }) {
  const [installed, setInstalled] = useState(false)
  return (
    <>
      <StepHeader title="Local model (optional)" lead="A small model that scores job titles against your target roles out of the box, and learns from your Relevant / Not relevant marks only when that helps — so fewer unlikely jobs reach the agent." />
      <LocalModelSetup onStatus={x => setInstalled(x.installed)} />
      <Footer>
        {installed
          ? <button type="button" className={PRIMARY} onClick={onNext}>Continue</button>
          : <button type="button" className={LINK} onClick={onNext}>Skip — use rules only</button>}
      </Footer>
    </>
  )
}
