import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { ChatMessage } from '../../lib/types'
import { ChatBubble } from './ChatBubble'

export const STARTERS = [
  'Find roles like my top-scored one',
  'Review my résumé against my three best matches',
  'Draft follow-up emails for applications older than a week',
  'Summarise what changed in my pipeline this week',
]

export function EmptyThread({ onPick }: { onPick: (text: string) => void }) {
  return (
    <div className="m-auto max-w-md p-6 text-center">
      <h2 className="m-0 text-base font-semibold">Ask the agent anything</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        It works in your career-ops folder with your installed skills — it can read your CV and reports, search for roles, and draft documents.
      </p>
      <div className="mt-4 grid gap-2">
        {STARTERS.map(s => <Button key={s} variant="secondary" size="sm" className="h-auto justify-start py-2 whitespace-normal text-left" onClick={() => onPick(s)}>{s}</Button>)}
      </div>
    </div>
  )
}

type Props = { messages: ChatMessage[]; logs: Record<string, string>; onRetry: (text: string) => void; empty: ReactNode }

/** Message log with auto-follow: sticks to the bottom until the user scrolls up (adapted from paperclip TaskMessageScroller). */
export function ThreadView({ messages, logs, onRetry, empty }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const [follow, setFollow] = useState(true)
  const live = messages.at(-1)?.runId ? logs[messages.at(-1)!.runId!] ?? '' : ''

  useLayoutEffect(() => {
    if (follow) ref.current?.scrollTo({ top: ref.current.scrollHeight })
  }, [follow, messages, live.length])

  const onScroll = () => {
    const el = ref.current
    if (el) setFollow(el.scrollHeight - el.scrollTop - el.clientHeight < 48)
  }

  // role="log" is implicitly live; turn that off and announce only state changes.
  const last = messages.at(-1)?.status
  const announce = last === 'running' ? 'Agent is working' : last === 'done' ? 'Reply finished' : last === 'failed' || last === 'cancelled' ? 'Reply failed — Retry available' : ''

  const lastUser = (i: number) => messages.slice(0, i).findLast(m => m.role === 'user')?.text

  return (
    <div className="relative flex min-h-0 flex-1 flex-col">
      <div ref={ref} onScroll={onScroll} role="log" aria-live="off" aria-label="Conversation" className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto p-4">
        {messages.length === 0 ? empty : messages.map((m, i) => {
          const retry = lastUser(i)
          return (
            <ChatBubble
              key={m.id}
              message={m}
              live={m.runId ? logs[m.runId] : undefined}
              onRetry={i === messages.length - 1 && retry ? () => onRetry(retry) : undefined}
            />
          )
        })}
      </div>
      <div role="status" className="sr-only">{announce}</div>
      {!follow && (
        <Button variant="secondary" size="sm" className="absolute bottom-3 left-1/2 -translate-x-1/2 shadow-md" onClick={() => setFollow(true)}>
          <ArrowDown aria-hidden /> Jump to latest
        </Button>
      )}
    </div>
  )
}
