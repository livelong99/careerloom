import { useCallback, useEffect, useState } from 'react'

import { careerloom, normalizeCliError } from '../../lib/ipc'
import type { BootstrapStatus, BootstrapStepId } from '../../lib/types'

const untouched = (s: BootstrapStatus) => !s.running && s.steps.every(x => x.state === 'pending')

/** Live first-launch install status; starts the install on first sight when nothing has run yet. */
export function useBootstrap(autoStart = true) {
  const [status, setStatus] = useState<BootstrapStatus | null>(null)
  const [error, setError] = useState<string | null>(null)
  const fail = (e: unknown) => setError(normalizeCliError(e).message)

  useEffect(() => {
    let live = true
    const off = careerloom.onBootstrap(s => { if (live) setStatus(s) })
    careerloom.bootstrapStatus()
      .then(async s => { if (live) setStatus(autoStart && untouched(s) ? await careerloom.bootstrapStart() : s) })
      .catch(e => { if (live) fail(e) })
    return () => { live = false; off() }
  }, [autoStart])

  const start = useCallback((retry?: BootstrapStepId) => {
    setError(null)
    careerloom.bootstrapStart(retry ? { retry } : undefined).then(setStatus, fail)
  }, [])
  return { status, error, start }
}
