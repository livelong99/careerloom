import { useRef, useState, type KeyboardEvent } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import type { ChatThreadSummary } from '../../lib/types'

export function ago(at: number, now = Date.now()): string {
  const min = Math.round((now - at) / 60_000)
  if (min < 1) return 'just now'
  if (min < 60) return `${min}m`
  if (min < 24 * 60) return `${Math.round(min / 60)}h`
  if (min < 48 * 60) return 'yesterday'
  return new Date(at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })
}

const STATUS = { running: { label: 'Running', variant: 'brand' }, failed: { label: 'Failed', variant: 'danger' }, idle: { label: 'Done', variant: 'success' } } as const

export function StatusBadge({ status }: { status: ChatThreadSummary['status'] }) {
  return <Badge variant={STATUS[status].variant}>{STATUS[status].label}</Badge>
}

type Props = {
  threads: ChatThreadSummary[]
  selected: string | null
  onSelect: (id: string) => void
  onNew: () => void
  onRename: (id: string, title: string) => Promise<void>
  /** Ask to delete (the screen confirms). */
  onDelete: (id: string) => void
}

export function ThreadList({ threads, selected, onSelect, onNew, onRename, onDelete }: Props) {
  const [query, setQuery] = useState('')
  const [editing, setEditing] = useState<{ id: string; title: string } | null>(null)
  const done = useRef(false) // Enter/Escape already settled this edit; the blur that follows must not repeat it
  const finish = async (save: boolean) => {
    if (done.current) return
    done.current = true
    const e = editing
    setEditing(null)
    if (save && e && e.title.trim() && e.title.trim() !== threads.find(t => t.id === e.id)?.title) await onRename(e.id, e.title)
  }
  const q = query.trim().toLowerCase()
  const shown = q ? threads.filter(t => `${t.title} ${t.preview}`.toLowerCase().includes(q)) : threads

  // ↑/↓ move focus between conversations.
  const onKeyDown = (e: KeyboardEvent<HTMLUListElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return
    const buttons = [...e.currentTarget.querySelectorAll<HTMLButtonElement>('button[data-thread]')]
    const i = buttons.indexOf(document.activeElement as HTMLButtonElement)
    const next = buttons[Math.min(buttons.length - 1, Math.max(0, i + (e.key === 'ArrowDown' ? 1 : -1)))]
    if (next) { e.preventDefault(); next.focus() }
  }

  return (
    <nav aria-label="Conversations" className="flex min-h-0 flex-col border-r border-border">
      <div className="space-y-2 p-3">
        <Button variant="primary" size="sm" className="w-full" onClick={onNew}><Plus aria-hidden /> New chat</Button>
        <Input type="search" aria-label="Search conversations" placeholder="Search conversations" value={query} onChange={e => setQuery(e.target.value)} />
      </div>
      <ul className="m-0 min-h-0 flex-1 list-none overflow-y-auto p-1.5" onKeyDown={onKeyDown}>
        {shown.map(t => (
          <li key={t.id} className="group relative">
            {editing?.id === t.id ? (
              <Input
                autoFocus
                aria-label="Chat name"
                maxLength={80}
                value={editing.title}
                onChange={e => setEditing({ id: t.id, title: e.target.value })}
                onBlur={() => void finish(true)}
                onKeyDown={e => { if (e.key === 'Enter') void finish(true); if (e.key === 'Escape') void finish(false) }}
                className="h-9"
              />
            ) : (
              <>
                <button
                  type="button"
                  data-thread
                  aria-current={t.id === selected ? 'true' : undefined}
                  onClick={() => onSelect(t.id)}
                  className={`block w-full cursor-pointer rounded-md border-0 px-2.5 py-2 text-left transition-colors focus-visible:outline-2 focus-visible:outline-ring ${t.id === selected ? 'bg-primary/[0.12]' : 'bg-transparent hover:bg-[var(--chrome-hover-bg)]'}`}
                >
                  <span className="block truncate pr-12 text-sm font-medium text-foreground" title={t.title}>{t.title}</span>
                  <span className="mt-1 flex items-center justify-between gap-2 text-xs text-muted-foreground">
                    <StatusBadge status={t.status} /><span className="tabular-nums">{ago(t.updatedAt)}</span>
                  </span>
                </button>
                <span className="absolute top-1.5 right-1.5 flex gap-0.5 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 motion-reduce:transition-none">
                  <Button type="button" variant="subtle" size="icon-xs" aria-label={`Rename ${t.title}`} onClick={() => { done.current = false; setEditing({ id: t.id, title: t.title }) }}><Pencil aria-hidden /></Button>
                  <Button type="button" variant="subtle" size="icon-xs" aria-label={`Delete ${t.title}`} disabled={t.status === 'running'} onClick={() => onDelete(t.id)}><Trash2 aria-hidden /></Button>
                </span>
              </>
            )}
          </li>
        ))}
        {!shown.length && <li className="px-2.5 py-2 text-xs text-muted-foreground">{q ? 'No conversations match.' : 'No conversations yet.'}</li>}
      </ul>
    </nav>
  )
}
