import { useState } from 'react'

import { useRuns } from '../../hooks/useRuns'
import { careerloom } from '../../lib/ipc'
import { ErrorLine, Footer, LINK, LiveRun, PRIMARY, StepHeader, errorText } from './parts'

/** Import a résumé file and have the agent turn it into career-ops' cv.md. Optional. */
export function ResumeStep({ onDone }: { onDone: () => void }) {
  const { runs, adopt } = useRuns()
  const [runId, setRunId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const status = runs.find(r => r.id === runId)?.status

  const add = async () => {
    setError(null)
    try {
      const source = await careerloom.importResume()
      if (!source) return
      const run = await careerloom.extractResume(source.file)
      adopt(run)
      setRunId(run.id)
    } catch (err) { setError(errorText(err)) }
  }

  const running = status === 'running'
  return (
    <>
      <StepHeader title="Add your résumé" lead="Pick your résumé (PDF, Word, Markdown or text). The agent reads it and writes the version career-ops uses to tailor applications." />
      {runId && <LiveRun id={runId} />}
      {status === 'done' && <p className="m-0 text-success">Your résumé is in. You can edit it any time in Resume.</p>}
      {status === 'failed' && <ErrorLine message="The agent couldn’t read that file. Check the log above, or try another file." />}
      <ErrorLine message={error} />
      <Footer>
        {status === 'done'
          ? <button type="button" className={PRIMARY} onClick={onDone}>Finish</button>
          : <>
              <button type="button" className={LINK} onClick={onDone}>{running ? 'Finish, keep it running' : 'Skip for now'}</button>
              <button type="button" className={PRIMARY} disabled={running} onClick={() => void add()}>{running ? 'Reading your résumé…' : status === 'failed' ? 'Try another file' : 'Add your résumé'}</button>
            </>}
      </Footer>
    </>
  )
}
