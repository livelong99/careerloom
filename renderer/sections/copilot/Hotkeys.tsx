import { useState } from 'react'

import { Note } from '@/components/copilot/Group'
import { HotkeyRow } from '@/components/copilot/HotkeyRow'
import { useCopilotConfig } from '@/components/copilot/api'
import { isWindowsPlatform } from '@/lib/platform'
import type { CopilotConfig } from '@/lib/types'
import { defaultHotkeys } from '../../../electron/copilot/hotkey-defaults'
import { Page } from '../resume/PageStub'

type Key = Exclude<keyof CopilotConfig['hotkeys'], 'panic'>
const LABELS: ReadonlyArray<{ key: Key; label: string }> = [
  { key: 'answer', label: 'Answer the last question' },
  { key: 'followup', label: 'Follow-up' },
  { key: 'clarify', label: 'Clarify the question' },
  { key: 'screenshot', label: 'Screenshot and solve' },
  { key: 'summarise', label: 'Summarise so far' },
  { key: 'expand', label: 'Expand or collapse' },
  { key: 'listen', label: 'Start or pause listening' },
  { key: 'toggle', label: 'Show or hide overlay' },
  { key: 'quickHide', label: 'Quick hide overlay' },
  { key: 'clear', label: 'Clear the unanswered question' },
]
const DEFAULTS = defaultHotkeys(isWindowsPlatform() ? 'win32' : 'darwin')
const ROWS: ReadonlyArray<{ key: Key; label: string; def: string }> = LABELS.map(r => ({ ...r, def: DEFAULTS[r.key] }))

export function HotkeysPage() {
  const { config, save } = useCopilotConfig()
  const [error, setError] = useState<string | null>(null)
  if (!config) return <Page title="Hotkeys" blurb="Loading…" />
  const keys = config.hotkeys

  function change(key: Key, accel: string): void {
    const clash = [...ROWS.filter(r => r.key !== key).map(r => keys[r.key]), keys.panic].includes(accel)
    if (clash) return setError(`${accel} is already used by another shortcut here. Choose a different one.`)
    setError(null)
    void save({ hotkeys: { [key]: accel } })
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
      <Note>The stop shortcut turns off the microphone and system audio, cancels any request in progress and hides the overlay. {isWindowsPlatform() ? 'The tray icon has the same button.' : 'The menu bar icon has the same button.'}</Note>
    </Page>
  )
}
