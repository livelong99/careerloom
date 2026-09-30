import { useEffect } from 'react'

import { careerloom } from '@/lib/ipc'
import type { SessionDetail } from '@/lib/types'
import { useAsync, type Async } from './api'

const POLL_MS = 4000
const POLL_MAX = 15

/** Session detail; while an ended, answered session has no scorecard yet, re-read every few seconds (scoring runs in the background). */
export function useSessionDetail(id: string | null): Async<SessionDetail | null> & { scoring: boolean } {
  const a = useAsync(async () => (id ? careerloom.copilotGetSession(id) : null), [id])
  const d = a.data
  const scoring = d !== null && d.endedAt !== null && d.scorecard === null && d.transcript.some(l => l.speaker === 'you')
  const reload = a.reload
  useEffect(() => {
    if (!scoring) return
    let n = 0
    const t = setInterval(() => { if (++n > POLL_MAX) clearInterval(t); else reload() }, POLL_MS)
    return () => clearInterval(t)
  }, [scoring, reload, id])
  return { ...a, scoring }
}
