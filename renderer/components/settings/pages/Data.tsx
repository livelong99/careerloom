import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { usePolled } from '../../../hooks/usePolled'
import { careerloom, normalizeCliError } from '../../../lib/ipc'
import { goToSettings } from '../../../lib/nav'
import { showToast } from '../../../lib/toast'
import type { ClearScope } from '../../../lib/types'
import { Group, Note, Row } from '../../kit/Group'
import { applyWithUndo, ConfirmDialog, DangerZone, SaveState, useSaveState } from '../kit'
import type { PageProps } from '../pages'

const RETENTION: Array<{ value: string; days: number | null; label: string }> = [
  { value: 'forever', days: null, label: 'Keep forever' },
  { value: '30', days: 30, label: '30 days' },
  { value: '90', days: 90, label: '90 days' },
  { value: '180', days: 180, label: '180 days' },
]

export const formatBytes = (n: number): string => (n < 1024 ? `${n} B` : n < 1024 ** 2 ? `${(n / 1024).toFixed(0)} KB` : n < 1024 ** 3 ? `${(n / 1024 ** 2).toFixed(0)} MB` : `${(n / 1024 ** 3).toFixed(1)} GB`)
const errorText = (err: unknown) => normalizeCliError(err).message

/** A loader that survives a backend method that is not wired yet: shows the message instead of crashing. */
function Unavailable({ error }: { error: { message: string } | null }) {
  return error ? <Note tone="warn">Not available yet: {error.message}</Note> : null
}

export function DataPage({ settings, onChanged }: PageProps) {
  const locations = usePolled(() => careerloom.dataLocations(), [], { intervalMs: null })
  const stats = usePolled(() => careerloom.dataStats(), [], { intervalMs: null })
  const keys = usePolled(() => careerloom.keysList(), [], { intervalMs: null })
  const retention = useSaveState()
  const days = settings.prefs.retention.runLogDays
  const s = stats.data

  const setDays = async (value: number | null) => {
    await retention.run(() => careerloom.prefsSet({ retention: { runLogDays: value } }))
    onChanged()
  }
  const copy = (text: string) => { void navigator.clipboard?.writeText(text).then(() => showToast('Path copied'), () => showToast('Could not copy', 'error')) }
  const reveal = (p: string) => { careerloom.revealPath(p).catch(err => showToast(errorText(err), 'error', 6000)) }
  const prune = async () => {
    try {
      const r = await careerloom.retentionPrune()
      showToast(r.removedFiles ? `Removed ${r.removedFiles} log files · freed ${formatBytes(r.freedBytes)}` : 'Nothing to remove')
      stats.refresh()
    } catch (err) { showToast(errorText(err), 'error', 6000) }
  }

  return (
    <>
      <Group title="Locations" focus="locations">
        <Unavailable error={locations.error} />
        {locations.loading && !locations.data && <p className="m-0 text-xs text-muted-foreground">Loading…</p>}
        {(locations.data ?? []).map(l => (
          <Row key={l.id} label={l.label} hint={<code className="break-all">{l.path ?? 'Not set'}</code>}>
            {l.path && <Button size="sm" variant="outline" onClick={() => reveal(l.path!)}>Show in Finder</Button>}
            {l.path && <Button size="sm" variant="outline" onClick={() => copy(l.path!)}>Copy path</Button>}
          </Row>
        ))}
      </Group>

      <Group title="Stored data" focus="stats">
        <Unavailable error={stats.error} />
        {s && (
          <Row label="Run history" hint={`${s.runs.toLocaleString()} runs · ${s.runLogFiles.toLocaleString()} log files · ${formatBytes(s.runLogBytes)} · ${s.threads} chat threads · ${s.copilotSessions} Copilot sessions`} />
        )}
        <Row focus="retention" label="Run-log retention" htmlFor="settings-retention" hint="Old run logs are removed when you prune. Costs and totals are kept. Default: keep forever, so upgrading never deletes anything.">
          <SaveState status={retention.status} />
          <Select value={RETENTION.find(r => r.days === days)?.value ?? 'forever'} onValueChange={v => { const next = RETENTION.find(r => r.value === v)!.days; applyWithUndo(`Run-log retention: ${RETENTION.find(r => r.days === next)!.label}`, days, next, setDays) }}>
            <SelectTrigger id="settings-retention" aria-label="Run-log retention" className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{RETENTION.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
          </Select>
          <Button size="sm" variant="outline" disabled={days === null} title={days === null ? 'Choose a retention period first' : undefined} onClick={() => void prune()}>Prune now</Button>
        </Row>
      </Group>

      <Group title="Secrets" focus="secrets">
        <Unavailable error={keys.error} />
        <Row label={`OS keychain${keys.data ? ` · ${keys.data.filter(k => k.hasKey).length} of ${keys.data.length} keys saved` : ''}`} hint={<>{(keys.data ?? []).map(k => `${k.label} ${k.hasKey ? 'saved' : 'not set'}`).join(' · ')}{keys.data ? '. ' : ''}Plugin keys sit in the career-ops <code>.env</code> (owner-only file). Values are never shown or sent to the UI.</>}>
          <Button size="sm" variant="outline" onClick={() => goToSettings('keys')}>Manage →</Button>
        </Row>
      </Group>

      <ClearZone onDone={stats.refresh} runLogs={s ? `${formatBytes(s.runLogBytes)} · ${s.runs.toLocaleString()} runs` : ''} chats={s ? `${s.threads} threads` : ''} sessions={s ? `${s.copilotSessions} sessions` : ''} />
    </>
  )
}

type Pending = { kind: 'run-logs' | 'chats' | 'copilot'; title: string; body: string; label: string }
const PENDING: Record<Pending['kind'], Pending> = {
  'run-logs': { kind: 'run-logs', title: 'Clear run logs?', body: 'Log files for past runs are deleted. Costs and totals are kept. This cannot be undone.', label: 'Clear logs' },
  chats: { kind: 'chats', title: 'Delete all chat threads?', body: 'Every Agent chat thread is deleted. This cannot be undone.', label: 'Delete threads' },
  copilot: { kind: 'copilot', title: 'Delete all Copilot sessions?', body: 'Transcripts, scores, notes and summaries of every Copilot session are deleted. This cannot be undone.', label: 'Delete sessions' },
}

function ClearZone({ runLogs, chats, sessions, onDone }: { runLogs: string; chats: string; sessions: string; onDone: () => void }) {
  const [pending, setPending] = useState<Pending | null>(null)
  const confirm = async () => {
    const p = pending
    setPending(null)
    if (!p) return
    try {
      if (p.kind === 'copilot') await careerloom.copilotDeleteSession('all')
      else await careerloom.dataClear(p.kind as ClearScope)
      showToast(`${p.label.split(' ')[0]} done`)
      onDone()
    } catch (err) { showToast(errorText(err), 'error', 6000) }
  }
  const row = (kind: Pending['kind'], focus: string, label: string, hint: string) => (
    <Row focus={focus} label={label} hint={hint}><Button size="sm" variant="outline" onClick={() => setPending(PENDING[kind])}>{PENDING[kind].label}…</Button></Row>
  )
  return (
    <>
      <DangerZone data-focus="danger">
        {row('run-logs', 'clear-run-logs', 'Clear run logs', `${runLogs}. Costs and totals are kept.`)}
        {row('chats', 'clear-chats', 'Delete chat threads', chats)}
        {row('copilot', 'clear-copilot', 'Delete Copilot sessions', `${sessions}, including summaries.`)}
      </DangerZone>
      <ConfirmDialog open={pending !== null} onOpenChange={o => { if (!o) setPending(null) }} title={pending?.title ?? ''} description={pending?.body} confirmLabel={pending?.label ?? ''} onConfirm={confirm} />
    </>
  )
}
