import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { careerloom } from '@/lib/ipc'
import { showToast } from '@/lib/toast'
import { useInterviewer } from '../../overlay/useInterviewer'
import { errorText } from './api'
import { Group } from './Group'

const STATE = { speaking: 'Speaking', thinking: 'Thinking', listening: 'Listening to you', idle: 'Finished' } as const

/** In the app while an AI-interviewer session runs: the caption, the controls and the typed-answer box (the overlay cannot take keyboard focus). */
export function InterviewLive() {
  const iv = useInterviewer()
  const [text, setText] = useState('')
  if (!iv.active) return null
  const run = (cmd: Record<string, string>): void => { void Promise.resolve(careerloom.copilotOverlay(cmd)).catch(e => showToast(errorText(e), 'error')) }
  const send = (): void => { const t = text.trim(); if (t) { run({ typed: t }); setText('') } }
  return (
    <Group title="Interview in progress" action={<span role="status" className="text-xs text-muted-foreground">AI interviewer · {STATE[iv.state]}</span>}>
      <p className="m-0 text-base font-semibold text-foreground" aria-live="polite" aria-atomic="true">{iv.question?.text ?? 'The interviewer will ask the first question in a moment…'}</p>
      {iv.hint ? <p className="m-0 mt-2 text-sm text-muted-foreground" role="status">{iv.hint}</p> : null}
      <div className="mt-3 flex flex-wrap gap-2" role="group" aria-label="Interviewer controls">
        <Button size="sm" variant="outline" onClick={() => run({ interviewer: 'replay' })}>Replay</Button>
        <Button size="sm" variant="outline" onClick={() => run({ interviewer: 'skip' })}>Skip</Button>
        <Button size="sm" variant="outline" onClick={() => run({ interviewer: 'hint' })}>Hint</Button>
      </div>
      <form className="mt-3 flex gap-2" onSubmit={e => { e.preventDefault(); send() }}>
        <input aria-label="Type your answer" value={text} maxLength={2000} onChange={e => setText(e.target.value)} placeholder="Type an answer instead of speaking…" className="h-8 min-w-0 flex-1 rounded-md border border-border bg-background px-3 text-sm outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50" />
        <Button type="submit" size="sm" disabled={!text.trim()}>Send answer</Button>
      </form>
    </Group>
  )
}
