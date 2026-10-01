import './interview.css'

import type { InterviewerPhase } from './useInterviewer'

const LABEL: Record<InterviewerPhase, string> = { speaking: 'Speaking', thinking: 'Thinking', listening: 'Listening to you', idle: 'Finished' }

/** Avatar, who is talking (always in words), and a decorative wave while the interviewer speaks. */
export function InterviewerRow({ state, voice, micPaused = false, notice = null }: { state: InterviewerPhase; voice: string | null; micPaused?: boolean; notice?: string | null }) {
  return (
    <div className="ivrow" data-state={state}>
      <span className="ivav" aria-hidden="true">AI</span>
      <div className="ivwho">
        <b>AI interviewer</b>
        <span role="status">{LABEL[state]}{state === 'speaking' && voice && voice !== 'default' ? ` · ${voice}` : ''}</span>
        {micPaused && state === 'speaking' && <span className="ivmic">Mic paused while I speak</span>}
        {notice && <span className="ivnote" role="status">{notice}</span>}
      </div>
      <span className="ivwave" aria-hidden="true"><i /><i /><i /><i /><i /></span>
    </div>
  )
}
