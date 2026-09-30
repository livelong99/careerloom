// Ported in part from Open-Cluely (owner's project), adapted for Careerloom: shortcut-manager.js accelerator recorder, as a React row.
import { useEffect, useState, type KeyboardEvent } from 'react'

import { Button } from '@/components/ui/button'
import { Kbd } from '@/components/ui/kbd'
import { careerloom } from '@/lib/ipc'
import { cn } from '@/lib/utils'
import { isNotImplemented } from './api'
import { Chip } from './hwControls'

type KeyEv = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey'>
const NAMED: Record<string, string> = { ArrowUp: 'Up', ArrowDown: 'Down', ArrowLeft: 'Left', ArrowRight: 'Right', Enter: 'Return', ' ': 'Space', Backspace: 'Backspace', Tab: 'Tab' }
const GLYPH: Record<string, string> = { Control: '⌃', Alt: '⌥', Shift: '⇧', Command: '⌘' }

/** Keydown → Electron accelerator. Needs Control, Alt or Command (Shift alone is just typing). Uses the physical key: on a Mac Alt+A types "å". */
export function toAccelerator(e: KeyEv): string | null {
  if (!(e.ctrlKey || e.altKey || e.metaKey)) return null
  const key = /^Key[A-Z]$/.test(e.code) ? e.code.slice(3) : /^Digit\d$/.test(e.code) ? e.code.slice(5) : e.code === 'Space' ? 'Space' : NAMED[e.key] ?? (/^F\d{1,2}$/.test(e.key) ? e.key : e.key.length === 1 ? e.key.toUpperCase() : null)
  if (!key) return null
  return [e.ctrlKey && 'Control', e.altKey && 'Alt', e.shiftKey && 'Shift', e.metaKey && 'Command', key].filter(Boolean).join('+')
}

export const formatAccelerator = (acc: string): string => acc.split('+').map(p => GLYPH[p] ?? p).join('')

type Status = { text: string; tone: 'neutral' | 'ok' | 'bad'; conflict: boolean }
const REASON: Record<string, string> = { 'in-use': 'In use by another app', reserved: 'Reserved by macOS', invalid: 'Not a valid shortcut' }

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
  const status = useStatus(accel)

  const record = (e: KeyboardEvent<HTMLButtonElement>): void => {
    e.preventDefault()
    if (e.key === 'Escape') return setRecording(false)
    const next = toAccelerator(e)
    if (!next) return
    setRecording(false)
    onChange(next)
  }

  return (
    <div role="row" className="grid grid-cols-[1fr_8rem_11rem_12rem] items-center gap-3 border-t border-border px-3 py-2 first:border-t-0">
      <span role="cell" className={cn('text-sm', danger ? 'font-medium text-destructive' : 'text-foreground')}>{label}</span>
      <span role="cell"><Kbd className="h-6 px-2 text-sm">{formatAccelerator(accel)}</Kbd></span>
      <span role="cell"><Chip tone={status.tone}>{status.text}</Chip></span>
      <span role="cell" className="flex items-center gap-2">
        {fixed ? <Chip>Always on</Chip> : recording ? (
          <Button size="sm" variant="outline" autoFocus onKeyDown={record} onBlur={() => setRecording(false)} aria-label="Press the new shortcut (Esc to cancel)">Press keys… Esc cancels</Button>
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
