import { useEffect, useState } from 'react'

import { errorText } from '@/components/copilot/api'
import { Markdown } from '@/components/Markdown'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { ToggleSwitch } from '@/components/ui/toggle-switch'
import { useUpdateStatus } from '@/hooks/useUpdateStatus'
import { careerloom } from '@/lib/ipc'
import { showToast } from '@/lib/toast'
import type { UpdateProgress } from '@/lib/types'
import { Group, Note, Row } from '../../kit/Group'
import { applyWithUndo, ConfirmDialog } from '../kit'
import type { PageProps } from '../pages'
import { formatBytes } from './Data'

const IDLE: UpdateProgress = { phase: 'idle', received: 0, total: 0, message: null }
const BUSY = new Set(['downloading', 'verifying', 'installing', 'restarting'])
const LABEL: Record<string, string> = { downloading: 'Downloading', verifying: 'Checking the download', installing: 'Installing', restarting: 'Restarting Careerloom' }

function useProgress(): UpdateProgress {
  const [p, setP] = useState(IDLE)
  useEffect(() => {
    let live = true
    if (typeof careerloom.getUpdateProgress === 'function') void careerloom.getUpdateProgress().then(v => { if (live && v) setP(v) }).catch(() => {})
    const off = typeof careerloom.onUpdateProgress === 'function' ? careerloom.onUpdateProgress(v => { if (live) setP(v) }) : undefined
    return () => { live = false; off?.() }
  }, [])
  return p
}

export function UpdatesPage({ settings, onChanged }: PageProps) {
  const status = useUpdateStatus()
  const progress = useProgress()
  const [checking, setChecking] = useState(false)
  const [confirm, setConfirm] = useState<number | null>(null)
  const [checkedAt, setCheckedAt] = useState<Date | null>(null)
  const enabled = settings.prefs.updates.enabled
  const busy = BUSY.has(progress.phase)
  const setEnabled = async (value: boolean) => { await careerloom.prefsSet({ updates: { enabled: value } }); onChanged() }

  async function checkNow(): Promise<void> {
    setChecking(true)
    try {
      const s = await careerloom.checkForUpdates()
      setCheckedAt(new Date())
      showToast(s.updateAvailable ? `Version ${s.latestVersion} is available` : `You're up to date (v${s.currentVersion})`)
    } catch (err) { showToast(errorText(err), 'error', 6000) } finally { setChecking(false) }
  }

  async function install(force = false): Promise<void> {
    setConfirm(null)
    try {
      const r = await careerloom.installUpdate({ force })
      if (!r.ok && r.reason === 'runs-active') setConfirm(r.running ?? 1)
      else if (!r.ok) showToast(r.message, 'error', 8000)
    } catch (err) { showToast(errorText(err), 'error', 8000) }
  }

  const version = status?.currentVersion
  const available = status?.updateAvailable === true && status.tag !== null
  const pct = progress.total > 0 ? Math.min(100, Math.round((progress.received / progress.total) * 100)) : 0

  return (
    <div className="flex flex-col gap-4 p-6">
      <Group title="Version" focus="updates" action={<Button size="sm" variant="outline" disabled={checking || busy} onClick={() => void checkNow()}>{checking ? 'Checking…' : 'Check now'}</Button>}>
        <Row label={version ? `Careerloom ${version}` : 'Careerloom'} hint={available ? `Version ${status?.latestVersion} is available.` : status?.latestVersion ? "You're on the latest version." : 'Not checked yet, or GitHub could not be reached.'}>
          {checkedAt && <span className="text-xs text-muted-foreground">Checked {checkedAt.toLocaleTimeString()}</span>}
        </Row>
        <Row label="Check automatically" hint="Looks at GitHub Releases at launch and once a day. It only tells you; nothing installs until you choose Update now.">
          <ToggleSwitch aria-label="Check for updates" checked={enabled} onCheckedChange={v => applyWithUndo(`Update checks ${v ? 'on' : 'off'}`, enabled, v, setEnabled)} />
        </Row>
      </Group>

      {available && status && (
        <Group title={`Version ${status.latestVersion} is ready`} focus="update-available">
          <Row label="Update now" hint={status.blocker ?? (status.asset ? `Downloads ${status.asset.name} (${formatBytes(status.asset.size)}) from GitHub, checks its SHA-256 checksum, installs it and restarts Careerloom.` : 'This release has no build for your computer. Open the release page to download it.')}>
            {!busy && <Button size="sm" disabled={Boolean(status.blocker) || !status.asset} onClick={() => void install()}>Update now</Button>}
            {!busy && (status.blocker || !status.asset) && <Button size="sm" variant="outline" onClick={() => void careerloom.openExternal(`https://github.com/livelong99/careerloom/releases/tag/${status.tag}`)}>Open release page</Button>}
            {progress.phase === 'downloading' && <Button size="sm" variant="outline" onClick={() => void careerloom.cancelUpdate()}>Cancel</Button>}
          </Row>
          {(busy || progress.phase === 'error' || progress.phase === 'cancelled') && (
            <div className="mt-3 flex flex-col gap-2" role="status" aria-live="polite">
              {busy && <><Progress value={progress.phase === 'downloading' ? pct : 100} aria-label="Update progress" />
                <p className="m-0 text-xs text-muted-foreground">{LABEL[progress.phase]}{progress.phase === 'downloading' ? ` · ${formatBytes(progress.received)} of ${formatBytes(progress.total)}` : '…'}</p></>}
              {progress.phase === 'error' && <Note tone="warn">{progress.message ?? 'The update failed.'} Nothing was changed; you can try again or download it from the release page.</Note>}
              {progress.phase === 'cancelled' && <p className="m-0 text-xs text-muted-foreground">Update cancelled.</p>}
            </div>
          )}
          {status.asset && !status.asset.verifiable && <Note tone="warn">This release has no published checksum, so Careerloom cannot verify it. Download it from the release page instead.</Note>}
          {status.notes && (
            <details className="mt-3 text-sm">
              <summary className="cursor-pointer text-sm font-medium">What&apos;s new</summary>
              <div className="mt-2 max-h-72 overflow-y-auto rounded-md border border-border p-3"><Markdown source={status.notes} /></div>
            </details>
          )}
        </Group>
      )}

      <ConfirmDialog open={confirm !== null} onOpenChange={o => { if (!o) setConfirm(null) }} title="Runs are still working" confirmLabel="Update anyway"
        description={`${confirm} run${confirm === 1 ? ' is' : 's are'} in progress. Updating restarts Careerloom and stops them. Wait for them to finish, or update anyway.`} onConfirm={() => install(true)} />
    </div>
  )
}
