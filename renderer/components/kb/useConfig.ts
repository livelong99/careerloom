import { useCallback, useEffect, useState } from 'react'

import type { InterviewConfig, ResearchOptions } from '../../../electron/kb/types'
import { isStub, kb } from './api'
import { CONSENT_VERSION } from './consentCopy'

// Used until interview.json loads (or when the build has no config handler).
export const FALLBACK_OPTS: ResearchOptions = { depth: 'standard', budgetUsd: 0.3, minutes: 5, allowAgent: false }

/** interview.json for the research defaults and the first-run consent state. */
export function useInterviewConfig() {
  const [config, setConfig] = useState<InterviewConfig | null>(null)
  useEffect(() => { kb().interviewConfig().then(c => setConfig(isStub(c) ? null : c), () => setConfig(null)) }, [])
  const agree = useCallback(async (version: string): Promise<void> => {
    setConfig(await kb().interviewSetConfig({ research: { consentVersion: version } }))
  }, [])
  const r = config?.research
  return {
    consented: r?.consentVersion === CONSENT_VERSION,
    opts: r ? { depth: r.depth, budgetUsd: r.budgetUsd, minutes: r.minutes, allowAgent: r.allowAgent } : FALLBACK_OPTS,
    backend: r?.search.backend ?? 'brave', agree,
  }
}
