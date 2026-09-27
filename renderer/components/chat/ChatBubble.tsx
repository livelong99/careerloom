import { memo } from 'react'
import { AlertCircle, RotateCcw } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { ChatMessage } from '../../lib/types'
import { Markdown } from '../Markdown'
import { ToolSteps } from './ToolSteps'
import { parseTranscript } from './transcript'

/** Streaming indicator while the agent works (adapted from paperclip TaskChatThinking). */
function Thinking() {
  return (
    <div className="flex items-center gap-2 py-1 text-xs text-muted-foreground">
      <span className="flex gap-1" aria-hidden>
        {[0, 150, 300].map(d => <span key={d} className="size-1.5 rounded-full bg-primary motion-safe:animate-bounce" style={{ animationDelay: `${d}ms` }} />)}
      </span>
      Working…
    </div>
  )
}

export const ChatBubble = memo(function ChatBubble({ message, live, onRetry }: { message: ChatMessage; live?: string; onRetry?: () => void }) {
  if (message.role === 'user') {
    return (
      <div className="ml-auto max-w-[min(80%,72ch)] rounded-lg bg-primary/[0.12] px-3 py-2 text-sm whitespace-pre-wrap break-words">
        <span className="sr-only">You: </span>{message.text}
      </div>
    )
  }
  const running = message.status === 'running'
  const items = parseTranscript(running ? live ?? '' : message.text)
  const failed = message.status === 'failed' || message.status === 'cancelled'
  return (
    <div className="max-w-[72ch] min-w-0 text-sm leading-normal">
      <span className="sr-only">Agent: </span>
      {items.map((item, i) =>
        item.kind === 'text' ? <Markdown key={i} source={item.text} />
          : item.kind === 'tools' ? <ToolSteps key={i} steps={item.steps} live={running && i === items.length - 1} />
            : <p key={i} className="mt-2 text-xs text-muted-foreground">{item.text.replace(/^done/, 'Done')}</p>,
      )}
      {running && <Thinking />}
      {failed && (
        <div className="mt-2 flex items-center gap-2 rounded-md bg-destructive/10 px-3 py-2 text-destructive">
          <AlertCircle className="size-4 shrink-0" aria-hidden />
          <span className="flex-1">{message.status === 'cancelled' ? 'You stopped this reply.' : 'The agent could not finish this reply.'}</span>
          {onRetry && <Button variant="danger" size="omniSm" onClick={onRetry}><RotateCcw aria-hidden /> Retry</Button>}
        </div>
      )}
    </div>
  )
})
