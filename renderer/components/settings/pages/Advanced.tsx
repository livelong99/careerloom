import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { usePolled } from '../../../hooks/usePolled'
import { useRuns } from '../../../hooks/useRuns'
import { careerloom, normalizeCliError } from '../../../lib/ipc'
import { showToast } from '../../../lib/toast'
import type { DiagnosticRow, ResetScope } from '../../../lib/types'
import { Group, Note, Row } from '../../kit/Group'
import { openRuns } from '@/lib/nav'
import { usePrefs } from '../usePrefs'
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
  const { prefs, patch } = usePrefs()
  const debugDir = prefs?.debug.dir ?? null
  const pickDebugDir = async () => {
    try { const dir = await careerloom.chooseDirectory(); if (dir) await patch({ debug: { dir } }) } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) }
  }
  const diag = usePolled(() => careerloom.diagnostics(), [], { intervalMs: null })
  const { runs } = useRuns()
  const [recheck, setRecheck] = useState(false)
  const [tail, setTail] = useState<{ id: string; text: string } | null>(null)
  const toggleTail = async (id: string) => {
    if (tail?.id === id) return setTail(null)
    try { setTail({ id, text: await careerloom.runLogTail(id, 20) }) } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) }
  }

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

      <Group title="Debug log" focus="debug-log">
        <Row label="Log everything to files" hint="Writes app, agent and Copilot activity (never API keys) to a folder you choose, one file per day. Turn it on, reproduce the problem, then send the folder.">
          <Button size="sm" variant={debugDir ? 'outline' : 'default'} disabled={!prefs} onClick={() => void (debugDir ? patch({ debug: { dir: null } }) : pickDebugDir())}>{debugDir ? 'Turn off' : 'Turn on…'}</Button>
        </Row>
        {debugDir && (
          <Row label="Log folder" hint="Transcripts, questions and answers are included: share it only with someone you trust.">
            <code className="max-w-72 truncate text-xs" title={debugDir}>{debugDir}</code>
            <Button size="sm" variant="outline" onClick={() => void careerloom.revealPath(debugDir)}>Open folder</Button>
            <Button size="sm" variant="outline" onClick={() => void pickDebugDir()}>Change…</Button>
          </Row>
        )}
      </Group>

      <Group title="Setup & repair" focus="setup-repair">
        <Row label="Re-run setup" hint="Re-checks Node, Python, Git, career-ops and OpenCode and reinstalls anything missing.">
          <Button size="sm" variant="outline" onClick={() => void careerloom.bootstrapStart().then(() => showToast('Setup re-checking in the background'), e => showToast(normalizeCliError(e).message, 'error', 6000))}>Re-run setup</Button>
        </Row>
      </Group>

      <Group title="Recent runs & logs" focus="run-history" action={<Button size="sm" variant="outline" onClick={() => openRuns()}>Open Runs</Button>}>
        {runs.length === 0 && <p className="m-0 text-xs text-muted-foreground">No runs yet.</p>}
        {runs.slice(0, 8).map(r => (
          <div key={r.id}>
            <Row label={r.label} hint={`${r.runner} · ${new Date(r.startedAt).toLocaleString()}`}>
              <ReadinessBadge state={r.status === 'done' ? 'ready' : r.status === 'running' ? 'checking' : r.status === 'failed' ? 'error' : 'off'} label={r.status} />
              <Button size="sm" variant="outline" onClick={() => openRuns(r.id)}>Log</Button>
              <Button size="sm" variant="outline" aria-expanded={tail?.id === r.id} onClick={() => void toggleTail(r.id)}>{tail?.id === r.id ? 'Hide tail' : 'Last lines'}</Button>
            </Row>
            {tail?.id === r.id && <pre aria-label="Last log lines" className="m-0 mb-2 max-h-48 overflow-auto rounded-lg border border-border bg-muted/40 p-2 text-xs">{tail.text || 'No log saved for this run (only scan logs are kept after a restart).'}</pre>}
          </div>
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
