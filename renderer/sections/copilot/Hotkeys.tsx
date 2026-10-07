import { useState } from 'react'

import { showToast } from '@/lib/toast'

import { Note } from '@/components/copilot/Group'
import { HotkeyRow } from '@/components/copilot/HotkeyRow'
import { useCopilotConfig } from '@/components/copilot/api'
import { kbdLabel } from '@/lib/copilot'
import { isWindowsPlatform } from '@/lib/platform'
import type { CopilotConfig } from '@/lib/types'
import { defaultHotkeys } from '../../../electron/copilot/hotkey-defaults'
import { sameAccelerator } from '../../../electron/copilot/hotkeys'
import { Page } from '../resume/PageStub'

type Key = Exclude<keyof CopilotConfig['hotkeys'], 'panic'>
const LABELS: ReadonlyArray<{ key: Key; label: string }> = [
  { key: 'answer', label: 'Answer the last question' },
  { key: 'followup', label: 'Follow-up' },
  { key: 'clarify', label: 'Clarify the question' },
  { key: 'screenshot', label: 'Screenshot and solve' },
  { key: 'summarise', label: 'Summarise so far' },
  { key: 'expand', label: 'Expand or collapse' },
  { key: 'listen', label: 'Start listening' },
  { key: 'toggle', label: 'Show or hide overlay' },
  { key: 'quickHide', label: 'Quick hide overlay' },
  { key: 'clear', label: 'Clear the unanswered question' },
]
const rows = (win: boolean): ReadonlyArray<{ key: Key; label: string; def: string }> => { const d = defaultHotkeys(win ? 'win32' : 'darwin'); return LABELS.map(r => ({ ...r, def: d[r.key] })) }

export function HotkeysPage() {
  const { config, save } = useCopilotConfig()
  const [error, setError] = useState<string | null>(null)
  if (!config) return <Page title="Hotkeys" blurb="Loading…" />
  const keys = config.hotkeys
  const win = isWindowsPlatform()
  const ROWS = rows(win)

  function change(key: Key, accel: string): void {
    const owner = [...ROWS.filter(r => r.key !== key).map(r => ({ label: r.label, accel: keys[r.key] })), { label: 'Stop everything now', accel: keys.panic }].find(o => sameAccelerator(o.accel, accel))
    const label = ROWS.find(r => r.key === key)?.label ?? key
    const shown = kbdLabel(accel, win)
    if (owner) return setError(`${shown} is already used by "${owner.label}". Choose a different shortcut for "${label}".`)
    setError(null)
    void save({ hotkeys: { [key]: accel } }).then(next => { if (next) showToast(`${label}: ${shown}`, 'ok') })
  }

  return (
    <Page title="Hotkeys" blurb={isWindowsPlatform() ? "Work while another app has focus. Combinations already used elsewhere are flagged. Avoid Ctrl+Alt: it is AltGr on many keyboard layouts." : "Work while another app has focus. Combinations already used elsewhere are flagged. Avoid Alt+Shift: it switches keyboard language on many systems."}>
      <div role="table" aria-label="Hotkeys" className="rounded-xl border border-border bg-card/40">
        <div role="row" className="grid grid-cols-[1fr_8rem_11rem_12rem] gap-3 px-3 py-2 text-xs text-muted-foreground">
          {['Action', 'Shortcut', 'Status', ''].map(h => <span key={h} role="columnheader">{h}</span>)}
        </div>
        {ROWS.map(r => <HotkeyRow key={r.key} label={r.label} accel={keys[r.key]} defaultAccel={r.def} onChange={a => change(r.key, a)} />)}
        <HotkeyRow label="Stop everything now" accel={keys.panic} defaultAccel={keys.panic} fixed danger onChange={() => {}} />
      </div>
      {error && <p role="alert" className="m-0 text-sm text-destructive">{error}</p>}
      <Note>Shortcuts work only while a session is running (Start listening also works from the stopped card).</Note>
      <Note>The stop shortcut turns off the microphone and system audio, cancels any request in progress and hides the overlay. {isWindowsPlatform() ? 'The tray icon has the same button.' : 'The menu bar icon has the same button.'}</Note>
    </Page>
  )
}
