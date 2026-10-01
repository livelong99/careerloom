import './interview.css'

import type { InterviewerPhase } from './useInterviewer'

const LABEL: Record<InterviewerPhase, string> = { speaking: 'Speaking', thinking: 'Thinking', listening: 'Listening to you', idle: 'Finished' }

/** Avatar, who is talking (always in words), and a decorative wave while the interviewer speaks. */
export function InterviewerRow({ state, voice }: { state: InterviewerPhase; voice: string | null }) {
  return (
    <div className="ivrow" data-state={state}>
      <span className="ivav" aria-hidden="true">AI</span>
      <div className="ivwho">
        <b>AI interviewer</b>
        <span role="status">{LABEL[state]}{state === 'speaking' && voice && voice !== 'default' ? ` · ${voice}` : ''}</span>
      </div>
      <span className="ivwave" aria-hidden="true"><i /><i /><i /><i /><i /></span>
    </div>
  )
}
