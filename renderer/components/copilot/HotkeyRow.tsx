// Ported in part from Open-Cluely (owner's project), adapted for Careerloom: shortcut-manager.js accelerator recorder, as a React row.
import { useEffect, useState, type KeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { careerloom } from '@/lib/ipc'
import { kbdLabel } from '@/lib/copilot'
import { isWindowsPlatform } from '@/lib/platform'
import { cn } from '@/lib/utils'
import { isNotImplemented } from './api'
import { Chip } from './hwControls'

type KeyEv = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>
const NAMED: Record<string, string> = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Enter: 'Return', ' ': 'Space', Backspace: 'Backspace', Tab: 'Tab' }

/** Keydown → Electron accelerator. Needs Control, Alt or Command (Shift alone is just typing). Uses the physical key: on a Mac Alt+A types "å". */
export function toAccelerator(e: KeyEv, win: boolean = isWindowsPlatform()): string | null {
  if (!(e.ctrlKey || e.altKey || e.metaKey)) return null
  const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit\d$/.test(e.code) ? e.code.slice(5) : e.code === 'Space' ? 'Space' : NAMED[e.key] ?? (/^F\d{1,2}$/.test(e.key) ? e.key : e.key.length === 1 ? e.key.toUpperCase() : null)
  if (!key) return null
  return [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && (win ? 'Super' : 'Command'), key].filter(Boolean).join('+')
}

/** ⌃⌥A on a Mac, Ctrl+Alt+A on Windows (the same helper the overlay uses). */
export const formatAccelerator = (acc: string, win: boolean = isWindowsPlatform()): string => kbdLabel(acc, win)

type Status = { text: string; tone: 'neutral' | 'ok' | 'bad'; conflict: boolean }
const REASON: Record<string, string> = { 'in-use': 'In use by another app', reserved: 'Reserved by the system', invalid: 'Not a valid shortcut' }

function useStatus(accel: string): Status {
  const [s, setS] = useState<Status>({ text: 'Checking…', tone: 'neutral', conflict: false })
  useEffect(() => {
    let live = true
    setS({ text: 'Checking…', tone: 'neutral', conflict: false })
    careerloom.copilotCheckHotkey(accel).then(r => {
      if (!live) return
      if (isNotImplemented(r)) setS({ text: 'Not checked', tone: 'neutral', conflict: false })
      else if (r.ok) setS({ text: 'Ready', tone: 'ok', conflict: false })
      else setS({ text: REASON[r.reason ?? ''] ?? 'Unavailable', tone: 'bad', conflict: true })
    }, () => { if (live) setS({ text: 'Not checked', tone: 'neutral', conflict: false }) })
    return () => { live = false }
  }, [accel])
  return s
}

export function HotkeyRow({ label, accel, defaultAccel, fixed, danger, onChange }: { label: string; accel: string; defaultAccel: string; fixed?: boolean; danger?: boolean; onChange: (accel: string) => void }) {
  const [recording, setRecording] = useState(false)
  const [tip, setTip] = useState(false)
  const status = useStatus(accel)

  const stop = (): void => { setRecording(false); setTip(false) }
  const record = (e: KeyboardEvent<HTMLButtonElement>): void => {
    e.preventDefault()
    if (e.key === 'Escape') return stop()
    const next = toAccelerator(e)
    if (!next) return setTip(!['Control', 'Alt', 'Shift', 'Meta', 'OS'].includes(e.key)) // a bare key is not a shortcut: say so instead of ignoring it
    stop()
    onChange(next)
  }

  return (
    <div role="row" className="grid grid-cols-[1fr_8rem_11rem_12rem] items-center gap-3 border-t border-border px-3 py-2 first:border-t-0">
      <span role="cell" className={cn('text-sm', danger ? 'font-medium text-destructive' : 'text-foreground')}>{label}</span>
      <span role="cell"><Kbd className="h-6 px-2 text-sm">{formatAccelerator(accel)}</Kbd></span>
      <span role="cell"><Chip tone={status.tone}>{status.text}</Chip></span>
      <span role="cell" className="flex items-center gap-2">
        {fixed ? <Chip>Always on</Chip> : recording ? (
          <Button size="sm" variant="outline" autoFocus onKeyDown={record} onBlur={stop} aria-label="Press the new shortcut (Esc to cancel)">{tip ? `Add ${isWindowsPlatform() ? 'Ctrl, Alt or Win' : '⌃, ⌥ or ⌘'}, then a key` : 'Press keys… Esc cancels'}</Button>
        ) : (
          <>
            <Button size="sm" variant={status.conflict ? 'default' : 'outline'} aria-label={`${status.conflict ? 'Choose another' : 'Change'} ${label}`} onClick={() => setRecording(true)}>{status.conflict ? 'Choose another' : 'Change'}</Button>
            {accel !== defaultAccel && <Button size="sm" variant="ghost" aria-label={`Reset ${label}`} onClick={() => onChange(defaultAccel)}>Reset</Button>}
          </>
        )}
      </span>
    </div>
  )
}
