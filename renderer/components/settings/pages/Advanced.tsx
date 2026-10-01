import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { usePolled } from '../../../hooks/usePolled'
import { useRuns } from '../../../hooks/useRuns'
import { careerloom, normalizeCliError } from '../../../lib/ipc'
import { showToast } from '../../../lib/toast'
import type { DiagnosticRow, ResetScope } from '../../../lib/types'
import { Group, Note, Row } from '../../kit/Group'
import { openRuns } from '../../RunsDrawer'
import { ConfirmDialog, DangerZone, ReadinessBadge, type ReadyState } from '../kit'
import { clearLocalPrefs } from '../localPrefs'
import type { PageProps } from '../pages'

// Hardcoded on purpose (timeouts, caps, sequential evaluation protect a 16 GB Mac); shown so nothing is a mystery.
const LIMITS: Array<[string, string]> = [
  ['Evaluation', 'One job at a time (per-job career-ops worker)'],
  ['Update check', 'Once every 24 hours, notify only'],
  ['Scan caps', 'Up to 200 jobs and 3 pages per board scan'],
  ['Agent turns (OpenCode Zen)', 'At most 80 per run'],
  ['Script timeout', '120 s per career-ops script'],
  ['Browser boards', 'Page wait up to 30 s; read-only tools, navigation locked to the board'],
]

const STATUS: Record<DiagnosticRow['status'], ReadyState> = { ok: 'ready', warn: 'needs-setup', missing: 'error' }
const STATUS_TEXT: Record<DiagnosticRow['status'], string> = { ok: 'OK', warn: 'Check', missing: 'Missing' }
const gb = (n: number) => (n / 1024 ** 3).toFixed(1)

export function AdvancedPage(_props: PageProps) {
  const diag = usePolled(() => careerloom.diagnostics(), [], { intervalMs: null })
  const { runs } = useRuns()
  const [recheck, setRecheck] = useState(false)

  const rows = diag.data?.rows ?? []
  const report = () => [...rows.map(r => `${r.label}: ${r.value ?? '—'} (${STATUS_TEXT[r.status]})`), diag.data ? `Memory: ${gb(diag.data.memory.freeBytes)} GB free of ${gb(diag.data.memory.totalBytes)} GB` : ''].filter(Boolean).join('\n')
  const copy = () => { void navigator.clipboard?.writeText(report()).then(() => showToast('Report copied'), () => showToast('Could not copy', 'error')) }
  const again = async () => {
    setRecheck(true)
    try { await careerloom.getReadiness(true) } catch { /* the diagnostics refresh below reports what failed */ }
    diag.refresh()
    setRecheck(false)
  }

  return (
    <>
      <Group title="Diagnostics" focus="diagnostics" action={<><Button size="sm" variant="outline" disabled={recheck || diag.loading} onClick={() => void again()}>{recheck ? 'Checking…' : 'Recheck all'}</Button><Button size="sm" variant="outline" disabled={!rows.length} onClick={copy}>Copy report</Button></>}>
        {diag.error && <Note tone="warn">Not available yet: {diag.error.message}</Note>}
        {diag.loading && !diag.data && <p className="m-0 text-xs text-muted-foreground">Checking…</p>}
        {rows.map(r => (
          <Row key={r.id} label={r.label} hint={r.hint}>
            <code className="max-w-72 truncate text-xs" title={r.value ?? undefined}>{r.value ?? '—'}</code>
            <ReadinessBadge state={STATUS[r.status]} label={STATUS_TEXT[r.status]} />
          </Row>
        ))}
        {diag.data && <Row label="Memory"><code className="text-xs">{gb(diag.data.memory.freeBytes)} GB free of {gb(diag.data.memory.totalBytes)} GB</code></Row>}
      </Group>

      <Group title="Recent runs & logs" focus="run-history" action={<Button size="sm" variant="outline" onClick={() => openRuns()}>Open Runs</Button>}>
        {runs.length === 0 && <p className="m-0 text-xs text-muted-foreground">No runs yet.</p>}
        {runs.slice(0, 8).map(r => (
          <Row key={r.id} label={r.label} hint={`${r.runner} · ${new Date(r.startedAt).toLocaleString()}`}>
            <ReadinessBadge state={r.status === 'done' ? 'ready' : r.status === 'running' ? 'checking' : r.status === 'failed' ? 'error' : 'off'} label={r.status} />
            <Button size="sm" variant="outline" onClick={() => openRuns(r.id)}>Log</Button>
          </Row>
        ))}
      </Group>

      <Group title="Limits" focus="limits">
        <Note>Read-only. These protect your machine and your accounts, so they are not settings.</Note>
        <div className="mt-2">{LIMITS.map(([k, v]) => <Row key={k} label={k} hint={v} />)}</div>
      </Group>

      <ResetZone />
    </>
  )
}

const RESETS: Record<ResetScope, { title: string; body: string; label: string; word?: string }> = {
  preferences: { title: 'Reset preferences?', body: 'Theme, language, refresh cadence, document defaults and update settings go back to their defaults. Your folder, runner, models and API keys are kept.', label: 'Reset preferences' },
  everything: { title: 'Reset everything?', body: 'Removes all preferences and every saved API key from your keychain, and clears remembered view state. Your career-ops folder is not touched.', label: 'Reset everything', word: 'RESET' },
}

function ResetZone() {
  const [scope, setScope] = useState<ResetScope | null>(null)
  const run = async () => {
    const s = scope
    setScope(null)
    if (!s) return
    try {
      await careerloom.settingsReset(s)
      clearLocalPrefs(s)
      showToast(`${RESETS[s].label} done — reloading`)
      setTimeout(() => window.location.reload(), 800)
    } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) }
  }
  const cfg = scope ? RESETS[scope] : null
  return (
    <>
      <Group title="Reset">
        <Row focus="reset-preferences" label="Reset preferences" hint="Theme, language, cadence, doc defaults. Keys, folder and runner are kept."><Button size="sm" variant="outline" onClick={() => setScope('preferences')}>Reset preferences…</Button></Row>
      </Group>
      <DangerZone>
        <Row focus="reset-everything" label="Reset everything" hint="Removes preferences and all saved API keys from the keychain. Your career-ops folder is not touched."><Button size="sm" variant="outline" onClick={() => setScope('everything')}>Reset everything…</Button></Row>
      </DangerZone>
      <ConfirmDialog open={scope !== null} onOpenChange={o => { if (!o) setScope(null) }} title={cfg?.title ?? ''} description={cfg?.body} confirmLabel={cfg?.label ?? ''} typeWord={cfg?.word} onConfirm={run} />
    </>
  )
}
