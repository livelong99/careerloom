import { useState } from 'react'

import { usePolled } from '../../hooks/usePolled'
import { useRuns } from '../../hooks/useRuns'
import { careerloom } from '../../lib/ipc'
import type { Settings } from '../../lib/types'
import { ErrorLine, Footer, LINK, LiveRun, PRIMARY, StepHeader, errorText } from './parts'

/** Put career-ops in Documents/career-ops (clone + npm install), or adopt an existing checkout. */
export function WorkspaceStep({ settings, onChanged, onNext }: { settings: Settings; onChanged: () => void; onNext: () => void }) {
  const { runs, adopt } = useRuns()
  const [runId, setRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const status = runs.find(r => r.id === runId)?.status
  // Re-read the folder state after a run: a failed clone can leave files behind.
  const pre = usePolled(() => careerloom.prerequisites(), [status], { intervalMs: null })
  const done = settings.rootCheck?.ok === true
  const dir = pre.data?.defaultCareerOpsDir
  const state = pre.data?.defaultDirState

  const install = async () => {
    setError(null)
    try {
      const { run } = await careerloom.installCareerOpsDefault()
      if (run) { adopt(run); setRunId(run.id) } else onChanged()
    } catch (err) { setError(errorText(err)) }
  }
  const choose = async () => {
    setError(null)
    try {
      const picked = await careerloom.chooseDirectory()
      if (!picked) return
      await careerloom.setRoot(picked)
      onChanged()
    } catch (err) { setError(`That folder isn’t a career-ops checkout (${errorText(err)}). Pick the folder that contains AGENTS.md and modes/.`) }
  }

  if (done) {
    return (
      <>
        <StepHeader title="career-ops is ready" lead={<>Your résumé, tracker and reports will live in <code>{settings.rootCheck?.ok ? settings.rootCheck.root : ''}</code>.</>} />
        {runId && <LiveRun id={runId} />}
        <Footer><button type="button" className={PRIMARY} onClick={onNext}>Continue</button></Footer>
      </>
    )
  }

  const running = status === 'running'
  const lead = state === 'valid'
    ? <>Found career-ops in <code>{dir}</code>. Careerloom will use it.</>
    : state === 'occupied'
      ? <><code>{dir}</code> already has other files in it. Move them, or choose an existing career-ops folder below.</>
      : <>career-ops is the free toolkit your agent works with. Careerloom downloads it to <code>{dir ?? 'Documents/career-ops'}</code> and installs what it needs. This takes a minute or two.</>
  return (
    <>
      <StepHeader title="Set up your workspace" lead={lead} />
      {runId && <LiveRun id={runId} />}
      {status === 'failed' && <ErrorLine message="Setup didn’t finish. The log above says why. Check your internet connection, then try again." />}
      <ErrorLine message={error} />
      <Footer>
        <button type="button" className={LINK} disabled={running} onClick={() => void choose()}>I already have career-ops…</button>
        <button type="button" className={PRIMARY} disabled={running || !pre.data || state === 'occupied'} onClick={() => void install()}>
          {running ? 'Setting up…' : state === 'valid' ? 'Use this folder' : status === 'failed' ? 'Try again' : 'Set up career-ops'}
        </button>
      </Footer>
    </>
  )
}
