import { useState } from 'react'

import { OvButton } from './ActionRow'

export type InterviewCmd = 'replay' | 'skip' | 'hint'

/** Replay, Skip and Hint (a hint is recorded and scored). `onType` adds a typed-answer box: only the main window can take keyboard focus. */
export function InterviewControls({ onControl, onType }: { onControl: (c: InterviewCmd) => void; onType?: (text: string) => void }) {
  const [text, setText] = useState('')
  const send = (): void => { const t = text.trim(); if (t && onType) { onType(t); setText('') } }
  return (
    <>
      <div className="acts" role="group" aria-label="Interviewer controls">
        <OvButton icon="refresh" label="Replay" title="Ask the question again" onClick={() => onControl('replay')} />
        <OvButton icon="right" label="Skip" title="Skip this question" onClick={() => onControl('skip')} />
        <OvButton icon="spark" label="Hint" title="Reveal the next cue (counts as a hint in your score)" onClick={() => onControl('hint')} />
      </div>
      {onType && (
        <form className="ivtype" onSubmit={e => { e.preventDefault(); send() }}>
          <input aria-label="Type your answer" value={text} maxLength={2000} onChange={e => setText(e.target.value)} placeholder="Type an answer instead of speaking…" />
          <button type="submit" className="ab pri" disabled={!text.trim()}>Send answer</button>
        </form>
      )}
    </>
  )
}
