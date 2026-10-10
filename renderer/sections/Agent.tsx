import { useEffect, useMemo, useRef, useState } from 'react'
import { Settings as SettingsIcon, Trash2 } from 'lucide-react'

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import type { InstalledSkill } from '../../electron/skills/types'
import { supportsImages } from '../../electron/image-support'
import { SettingChip } from '../components/settings/SettingChip'
import { Composer, type Outgoing } from '../components/chat/Composer'
import { listEnabledSkills, openSkillsSettings } from '../components/chat/skills'
import { StatusBadge, ThreadList } from '../components/chat/ThreadList'
import { EmptyThread, ThreadView } from '../components/chat/ThreadView'
import { usePolled } from '../hooks/usePolled'
import { useRuns } from '../hooks/useRuns'
import { OPEN_THREAD_KEY } from '../lib/nav'
import { careerloom, normalizeCliError } from '../lib/ipc'
import { goToSettings } from '../lib/nav'
import { showToast } from '../lib/toast'
import type { ChatMessage, ChatThread, Settings } from '../lib/types'

const RUNNERS: Record<string, string> = { claude: 'Claude Code', codex: 'Codex', antigravity: 'Antigravity', opencode: 'OpenCode', zen: 'OpenCode Zen', api: 'API' }

type SendExtras = { attachments?: Outgoing['attachments']; skills?: string[]; reuse?: string[] }

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
  const [deleting, setDeleting] = useState<string | null>(null)
  const [settings, setSettings] = useState<Settings | null>(null)
  const [skills, setSkills] = useState<InstalledSkill[]>([])
  const [chosen, setChosen] = useState<InstalledSkill[]>([])
  const runner = settings?.runner ?? null
  const apiRunner = runner === 'api'
  const composer = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    const load = () => void careerloom.getSettings().then(setSettings).catch(() => {})
    load()
    return careerloom.onSettings(load)
  }, [])

  useEffect(() => {
    let live = true
    void listEnabledSkills().then(s => { if (live) setSkills(s) })
    return () => { live = false }
  }, [generation])

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
  const skillNames = useMemo(() => Object.fromEntries(skills.map(s => [s.id, s.name])), [skills])
  const imageSupport = runner && settings ? supportsImages(runner, settings.models[runner as keyof Settings['models']]) : undefined

  /** True once the agent accepted the message (the composer then clears its images and skill chips). */
  const send = async (text: string, extras: SendExtras = {}): Promise<boolean> => {
    setSending(true)
    try {
      const res = await careerloom.sendMessage(selected, text, {
        attachments: extras.attachments?.map(a => ({ name: a.name, data: a.data })),
        skills: extras.skills,
        reuse: extras.reuse,
      })
      adopt(res.run)
      setThread(res.thread)
      setSelected(res.thread.id)
      setDraft(d => (d === text ? '' : d))
      void list.refresh()
      return true
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error', 6000)
      return false
    } finally {
      setSending(false)
    }
  }

  const retry = (m: ChatMessage) => void send(m.text, { skills: m.skills, reuse: m.attachments?.map(a => a.id) })

  const remove = async () => {
    const id = deleting
    setDeleting(null)
    if (!id) return
    try {
      await careerloom.deleteThread(id)
      if (id === selected) setSelected(null)
      void list.refresh()
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error')
    }
  }

  const rename = async (id: string, title: string) => {
    try {
      const next = await careerloom.renameThread(id, title)
      if (id === selected) setThread(next)
      void list.refresh()
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error')
    }
  }

  const fill = (text: string) => { setDraft(text); composer.current?.focus() }
  const pickSkill = (skill: InstalledSkill) => { setChosen(cur => (cur.some(s => s.id === skill.id) ? cur : [...cur, skill])); composer.current?.focus() }
  const newChat = () => { setSelected(null); setDraft(''); setChosen([]); composer.current?.focus() }
  const deleteTitle = list.data?.find(t => t.id === deleting)?.title ?? thread?.title

  return (
    <div className="workspace grid h-full min-h-0 grid-cols-[280px_minmax(0,1fr)] overflow-hidden rounded-[14px] border border-[var(--line)] bg-[var(--panel)]">
      <ThreadList threads={list.data ?? []} selected={selected} onSelect={setSelected} onNew={newChat} onRename={rename} onDelete={setDeleting} />
      <section aria-label="Chat" className="flex min-h-0 min-w-0 flex-col">
        <header className="flex min-h-12 shrink-0 items-center gap-2 border-b border-border px-4">
          <h2 className="m-0 min-w-0 flex-1 truncate text-sm font-semibold">{thread?.title ?? 'New chat'}</h2>
          {thread ? <span className="shrink-0 text-xs text-muted-foreground">{RUNNERS[thread.runner] ?? thread.runner}</span>
            : runner && <SettingChip label="Runner" value={RUNNERS[runner] ?? runner} page="runners" focus={`runner:${runner}`} />}
          {thread && <StatusBadge status={thread.status} />}
          {thread && (
            <Button variant="subtle" size="sm" onClick={() => setDeleting(thread.id)} disabled={running}>
              <Trash2 aria-hidden /> Delete
            </Button>
          )}
        </header>
        {apiRunner && (
          <div role="note" className="flex shrink-0 items-center gap-2 bg-accent/10 px-4 py-2 text-sm">
            <span className="flex-1">Chat needs Claude Code, Codex or Antigravity — the API runner only runs fixed pipeline steps.</span>
            <Button variant="secondary" size="sm" onClick={() => goToSettings('runners', 'runner:api')}>
              <SettingsIcon aria-hidden /> Open settings
            </Button>
          </div>
        )}
        <ThreadView
          threadId={selected}
          messages={thread?.messages ?? []}
          logs={logs}
          skillNames={skillNames}
          onRetry={retry}
          empty={<EmptyThread onPick={fill} onPickSkill={pickSkill} skills={skills} onManageSkills={openSkillsSettings} />}
        />
        <Composer
          ref={composer}
          value={draft}
          onChange={setDraft}
          onSend={extras => send(draft.trim(), { attachments: extras.attachments, skills: extras.skills })}
          onStop={() => { if (runId) void careerloom.cancelRun(runId) }}
          running={running}
          disabled={sending || apiRunner}
          sending={sending}
          imageSupport={imageSupport}
          skills={skills}
          chosen={chosen}
          onChosen={setChosen}
          onManageSkills={openSkillsSettings}
        />
      </section>
      <AlertDialog open={deleting !== null} onOpenChange={open => { if (!open) setDeleting(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {deleteTitle ? `“${deleteTitle}”` : 'this chat'}?</AlertDialogTitle>
            <AlertDialogDescription>The conversation and its attached images are removed from Careerloom. Files the agent changed stay as they are.</AlertDialogDescription>
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
