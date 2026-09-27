import { useEffect, useRef, useState } from 'react'
import { Settings as SettingsIcon, Trash2 } from 'lucide-react'

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Composer } from '../components/chat/Composer'
import { StatusBadge, ThreadList } from '../components/chat/ThreadList'
import { EmptyThread, ThreadView } from '../components/chat/ThreadView'
import { usePolled } from '../hooks/usePolled'
import { useRuns } from '../hooks/useRuns'
import { OPEN_THREAD_KEY } from '../components/RunsDrawer'
import { careerloom, normalizeCliError } from '../lib/ipc'
import { showToast } from '../lib/toast'
import type { ChatThread } from '../lib/types'

const RUNNERS: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', antigravity: 'Antigravity', api: 'API' }

/** Agent chat: free-form asks to the agent, outside the fixed pipeline modes. */
export function Agent() {
  const { generation, logs, adopt } = useRuns()
  const list = usePolled(() => careerloom.listThreads(), [generation], { intervalMs: null })
  const [selected, setSelected] = useState<string | null>(() => {
    try {
      const id = sessionStorage.getItem(OPEN_THREAD_KEY)
      sessionStorage.removeItem(OPEN_THREAD_KEY)
      return id
    } catch { return null }
  })
  const [thread, setThread] = useState<ChatThread | null>(null)
  const [draft, setDraft] = useState('')
  const [sending, setSending] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [apiRunner, setApiRunner] = useState(false)
  const composer = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const load = () => void careerloom.getSettings().then(s => setApiRunner(s.runner === 'api')).catch(() => {})
    load()
    return careerloom.onSettings(load)
  }, [])

  // Refetch the open thread when any run exits (its reply is persisted on exit).
  useEffect(() => {
    if (!selected) { setThread(null); return }
    let live = true
    careerloom.getThread(selected).then(t => { if (live) setThread(t) }, err => {
      if (!live) return
      showToast(normalizeCliError(err).message, 'error')
      setSelected(null)
    })
    return () => { live = false }
  }, [selected, generation])

  const running = thread?.status === 'running'
  const runId = running ? thread.messages.at(-1)?.runId : undefined

  const send = async (text: string) => {
    setSending(true)
    try {
      const res = await careerloom.sendMessage(selected, text)
      adopt(res.run)
      setThread(res.thread)
      setSelected(res.thread.id)
      setDraft(d => (d === text ? '' : d))
      void list.refresh()
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error', 6000)
    } finally {
      setSending(false)
    }
  }

  const remove = async () => {
    if (!selected) return
    setConfirmDelete(false)
    try {
      await careerloom.deleteThread(selected)
      setSelected(null)
      void list.refresh()
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error')
    }
  }

  const fill = (text: string) => { setDraft(text); composer.current?.focus() }
  const newChat = () => { setSelected(null); setDraft(''); composer.current?.focus() }

  return (
    <div className="workspace grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)] overflow-hidden rounded-[14px] border border-[var(--line)] bg-[var(--panel)]">
      <ThreadList threads={list.data ?? []} selected={selected} onSelect={setSelected} onNew={newChat} />
      <section aria-label="Chat" className="flex min-h-0 min-w-0 flex-col">
        <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <h2 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold">{thread?.title ?? 'New chat'}</h2>
          {thread && <span className="shrink-0 text-xs text-muted-foreground">{RUNNERS[thread.runner] ?? thread.runner}</span>}
          {thread && <StatusBadge status={thread.status} />}
          {thread && (
            <Button variant="subtle" size="sm" onClick={() => setConfirmDelete(true)} disabled={running}>
              <Trash2 aria-hidden /> Delete
            </Button>
          )}
        </header>
        {apiRunner && (
          <div role="note" className="flex shrink-0 items-center gap-2 bg-accent/10 px-4 py-2 text-sm">
            <span className="flex-1">Chat needs Claude Code, Codex or Antigravity — the API runner only runs fixed pipeline steps.</span>
            <Button variant="secondary" size="sm" onClick={() => window.dispatchEvent(new CustomEvent('careerloom:navigate', { detail: 'settings' }))}>
              <SettingsIcon aria-hidden /> Open settings
            </Button>
          </div>
        )}
        <ThreadView messages={thread?.messages ?? []} logs={logs} onRetry={text => void send(text)} empty={<EmptyThread onPick={fill} />} />
        <Composer
          ref={composer}
          value={draft}
          onChange={setDraft}
          onSend={() => void send(draft.trim())}
          onStop={() => { if (runId) void careerloom.cancelRun(runId) }}
          running={running}
          disabled={sending || apiRunner}
          sending={sending}
        />
      </section>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete this chat?</AlertDialogTitle>
            <AlertDialogDescription>The conversation is removed from Careerloom. Files the agent changed stay as they are.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={() => void remove()}>Delete chat</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
