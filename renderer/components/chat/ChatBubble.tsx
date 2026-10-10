import { memo } from 'react'
import { AlertCircle, RotateCcw, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { ChatMessage } from '../../lib/types'
import { Markdown } from '../Markdown'
import { MessageImages } from './MessageImages'
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

export const ChatBubble = memo(function ChatBubble({ message, live, threadId, skillNames, onRetry }: { message: ChatMessage; live?: string; threadId?: string; skillNames?: Record<string, string>; onRetry?: () => void }) {
  if (message.role === 'user') {
    return (
      <div className="ml-auto flex max-w-[min(80%,72ch)] flex-col items-end">
        {threadId && message.attachments?.length ? <MessageImages threadId={threadId} attachments={message.attachments} /> : null}
        {message.skills?.length ? (
          <ul aria-label="Skills used" className="m-0 mb-1 flex list-none flex-wrap justify-end gap-1 p-0">
            {message.skills.map(id => <li key={id} className="inline-flex items-center gap-1 rounded-full bg-[var(--thread)]/15 px-2 py-0.5 text-xs"><Sparkles className="size-3 text-[var(--thread)]" aria-hidden />{skillNames?.[id] ?? id}</li>)}
          </ul>
        ) : null}
        <div className="rounded-lg bg-primary/[0.12] px-3 py-2 text-sm whitespace-pre-wrap break-words">
          <span className="sr-only">You: </span>{message.text}
        </div>
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
