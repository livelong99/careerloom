import { Footer, PRIMARY, StepHeader } from '../onboarding/parts'
import { BootstrapPanel } from './BootstrapPanel'
import { useBootstrap } from './useBootstrap'
import type { BootstrapStatus, BootstrapStepId } from '../../lib/types'

type ViewProps = { status: BootstrapStatus | null; error: string | null; onRetry: (id: BootstrapStepId) => void; onNext?: () => void }

/** The install list with its header; Continue (onboarding only) unlocks when the core steps are done. */
export function SetupView({ status, error, onRetry, onNext }: ViewProps) {
  return (
    <>
      <StepHeader title="Setting things up" lead="Careerloom is installing what it needs: Node, Python, Git, career-ops and OpenCode. Nothing for you to do. If a step fails, copy the fix prompt into any agent CLI and retry." />
      {error && <p role="alert" className="m-0 text-destructive">{error}</p>}
      {status ? <BootstrapPanel status={status} onRetry={onRetry} /> : !error && <p className="m-0 text-muted-foreground" role="status">Checking…</p>}
      {onNext && <Footer><button type="button" className={PRIMARY} disabled={!status?.coreDone} onClick={onNext}>Continue</button></Footer>}
    </>
  )
}

/** Onboarding step. App.tsx owns the auto-start, so this only watches. */
export function SetupStep({ onNext }: { onNext: () => void }) {
  const { status, error, start } = useBootstrap(false)
  return <SetupView status={status} error={error} onRetry={start} onNext={onNext} />
}
