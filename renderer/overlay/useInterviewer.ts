// What the overlay (and the Practice page) needs to know about an AI-interviewer session: it is active once main reports an
// interviewer state, the caption is the last question asked, and everything resets when the session stops.
import { useEffect, useState } from 'react'

import type { DetectedQuestion } from '../../electron/contract'

export type InterviewerPhase = 'speaking' | 'thinking' | 'listening' | 'idle'
export type InterviewerView = { active: boolean; state: InterviewerPhase; voice: string | null; question: { id: string; text: string } | null }
export const NO_INTERVIEWER: InterviewerView = { active: false, state: 'idle', voice: null, question: null }

type Subscribe = (name: string, cb: (payload: unknown) => void) => () => void

export function useInterviewer(): InterviewerView {
  const [v, setV] = useState<InterviewerView>(NO_INTERVIEWER)
  useEffect(() => {
    const sub = (window.careerloom as { onCopilotEvent?: Subscribe } | undefined)?.onCopilotEvent
    if (!sub) return
    const offs = [
      sub('interviewerState', p => { const s = p as { state: InterviewerPhase; voice: string | null }; setV(prev => ({ ...prev, active: true, state: s.state, voice: s.voice })) }),
      sub('copilotQuestion', p => { const q = p as DetectedQuestion; setV(prev => ({ ...prev, question: { id: q.id, text: q.text } })) }),
      sub('copilotState', p => { const s = p as { state: string }; if (s.state === 'stopped' || s.state === 'armed') setV(NO_INTERVIEWER) }),
    ]
    return () => offs.forEach(off => off())
  }, [])
  return v
}
