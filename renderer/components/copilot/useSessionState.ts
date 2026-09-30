// Live capture/session state from main (copilotState events): drives the header's Start/Stop buttons.
import { useEffect, useState } from 'react'

import { careerloom } from '@/lib/ipc'
import type { CopilotEvents } from '@/lib/types'

export type SessionState = CopilotEvents['copilotState']
const IDLE: SessionState = { state: 'idle', mode: 'practice', sessionId: null, sources: [], startedAt: null }

export function useSessionState(): SessionState {
  const [s, setS] = useState<SessionState>(IDLE)
  useEffect(() => careerloom.onCopilotEvent('copilotState', setS), [])
  return s
}
export const isRunning = (s: SessionState): boolean => s.state === 'armed' || s.state === 'listening'
