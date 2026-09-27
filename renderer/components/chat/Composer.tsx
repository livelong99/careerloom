import { forwardRef, type KeyboardEvent } from 'react'
import { ArrowUp, Square } from 'lucide-react'

import { Button } from '@/components/ui/button'
import { Textarea } from '@/components/ui/textarea'

type Props = {
  value: string
  onChange: (value: string) => void
  onSend: () => void
  onStop: () => void
  running: boolean
  disabled?: boolean
  sending?: boolean
}

/** Autosizing (CSS field-sizing) message box: Enter or ⌘Enter sends, Shift+Enter adds a line. */
export const Composer = forwardRef<HTMLTextAreaElement, Props>(function Composer({ value, onChange, onSend, onStop, running, disabled, sending }, ref) {
  const canSend = !running && !disabled && value.trim().length > 0
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key !== 'Enter' || e.shiftKey || e.nativeEvent.isComposing) return
    e.preventDefault()
    if (canSend) onSend()
  }
  return (
    <form className="shrink-0 border-t border-border p-3" onSubmit={e => { e.preventDefault(); if (canSend) onSend() }}>
      <label htmlFor="agent-composer" className="mb-1 block text-xs font-medium text-muted-foreground">Ask the agent</label>
      <div className="flex items-end gap-2">
        <Textarea
          ref={ref}
          id="agent-composer"
          value={value}
          onChange={e => onChange(e.target.value)}
          onKeyDown={onKeyDown}
          disabled={disabled}
          maxLength={20_000}
          rows={1}
          placeholder={running ? 'The agent is working — you can draft your next message' : 'Describe what you want done'}
          aria-describedby="agent-composer-hint"
          className="max-h-48 min-h-10 resize-none font-sans placeholder:font-sans"
        />
        {running
          ? <Button type="button" variant="danger" size="sm" onClick={onStop}><Square aria-hidden /> Stop</Button>
          : <Button type="submit" variant="primary" size="sm" disabled={!canSend}><ArrowUp aria-hidden /> {sending ? 'Sending…' : 'Send'}</Button>}
      </div>
      <p id="agent-composer-hint" className="mt-1 mb-0 text-xs text-muted-foreground">Enter sends; Shift+Enter adds a new line.</p>
    </form>
  )
})
