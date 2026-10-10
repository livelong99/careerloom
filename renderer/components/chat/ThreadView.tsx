import { useLayoutEffect, useRef, useState, type ReactNode } from 'react'
import { ArrowDown, Sparkles } from 'lucide-react'

import { Button } from '@/components/ui/button'
import type { InstalledSkill } from '../../../electron/skills/types'
import type { ChatMessage } from '../../lib/types'
import { ChatBubble } from './ChatBubble'

export const STARTERS = [
  'Find roles like my top-scored one',
  'Review my résumé against my three best matches',
  'Draft follow-up emails for applications older than a week',
  'Summarise what changed in my pipeline this week',
]

export function EmptyThread({ onPick, onPickSkill, skills = [], onManageSkills }: { onPick: (text: string) => void; onPickSkill?: (skill: InstalledSkill) => void; skills?: InstalledSkill[]; onManageSkills?: () => void }) {
  return (
    <div className="m-auto w-full max-w-lg p-6 text-center">
      <h2 className="m-0 text-base font-semibold">Ask the agent anything</h2>
      <p className="mt-1 text-sm text-muted-foreground">
        It works in your career-ops folder with your installed skills — it can read your CV and reports, search for roles, and draft documents. Attach screenshots by pasting or dropping them.
      </p>
      <div className="mt-4 grid gap-2">
        {STARTERS.map(s => <Button key={s} variant="secondary" size="sm" className="h-auto justify-start py-2 whitespace-normal text-left" onClick={() => onPick(s)}>{s}</Button>)}
      </div>
      <section aria-label="Installed skills" className="mt-5 text-left">
        <h3 className="m-0 mb-1.5 text-xs font-medium text-muted-foreground">Skills — type / in the box to use one</h3>
        {skills.length > 0 ? (
          <ul className="m-0 flex list-none flex-wrap gap-1.5 p-0">
            {skills.slice(0, 12).map(s => (
              <li key={s.id}>
                <Button variant="outline" size="xs" title={s.description} onClick={() => onPickSkill?.(s)}><Sparkles className="text-[var(--thread)]" aria-hidden /> {s.name}</Button>
              </li>
            ))}
          </ul>
        ) : <p className="m-0 text-xs text-muted-foreground">No skills installed yet.</p>}
        {onManageSkills && <Button variant="link" size="xs" className="mt-1 h-auto p-0" onClick={onManageSkills}>Manage skills</Button>}
      </section>
    </div>
  )
}

type Props = { threadId: string | null; messages: ChatMessage[]; logs: Record<string, string>; skillNames: Record<string, string>; onRetry: (message: ChatMessage) => void; empty: ReactNode }

/** Message log with auto-follow: sticks to the bottom until the user scrolls up (adapted from paperclip TaskMessageScroller). */
export function ThreadView({ threadId, messages, logs, skillNames, onRetry, empty }: Props) {
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

  const lastUser = (i: number) => messages.slice(0, i).findLast(m => m.role === 'user')

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
              threadId={threadId ?? undefined}
              skillNames={skillNames}
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
