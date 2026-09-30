// Ported from Open-Cluely (owner's project), adapted for Careerloom: shortcut set + register checks (config.js),
// new ⌃⌥ accelerators (Alt+Shift dropped: IME clash). A failed register is reported, never swallowed.
import type { CopilotConfig } from './types'

export type HotkeyAction = keyof CopilotConfig['hotkeys']
export type HotkeyReason = 'in-use' | 'reserved' | 'invalid'
export type HotkeyResult = { action: HotkeyAction; accelerator: string; registered: boolean; reason?: HotkeyReason }
export type HotkeyCheck = { ok: boolean; reason?: HotkeyReason }

/** The slice of Electron's `globalShortcut` used here (injected so tests need no Electron). */
export type ShortcutApi = {
  register(accelerator: string, cb: () => void): boolean
  unregister(accelerator: string): void
  isRegistered(accelerator: string): boolean
}

const MODIFIERS = new Set(['command', 'cmd', 'control', 'ctrl', 'commandorcontrol', 'cmdorctrl', 'alt', 'option', 'altgr', 'shift', 'super', 'meta'])
const NAMED_KEYS = new Set(['space', 'tab', 'enter', 'return', 'escape', 'esc', 'backspace', 'delete', 'insert', 'home', 'end', 'pageup', 'pagedown', 'up', 'down', 'left', 'right', 'plus'])
const isKey = (k: string): boolean => /^[a-z0-9]$/i.test(k) || /^f([1-9]|1\d|2[0-4])$/i.test(k) || NAMED_KEYS.has(k.toLowerCase())
// macOS system shortcuts we refuse to shadow (Electron would happily register some of them).
const RESERVED = new Set(['command+q', 'command+w', 'command+tab', 'command+space', 'command+h', 'command+m', 'control+command+q', 'control+command+space', 'command+option+escape'])
const norm = (accel: string): string => accel.split('+').map(p => p.trim().toLowerCase()).sort().join('+')
const RESERVED_NORM = new Set([...RESERVED].map(norm))

/** Syntax + reserved check; does not touch the OS. */
export function validateAccelerator(accel: string): HotkeyCheck {
  const parts = accel.split('+').map(p => p.trim())
  const key = parts.at(-1) ?? ''
  const mods = parts.slice(0, -1)
  if (parts.length < 2 || !isKey(key) || mods.some(m => !MODIFIERS.has(m.toLowerCase()))) return { ok: false, reason: 'invalid' }
  if (RESERVED_NORM.has(norm(accel))) return { ok: false, reason: 'reserved' }
  return { ok: true }
}

export function createHotkeyService(gs: ShortcutApi) {
  let ours: string[] = []

  function unregisterAll(): void {
    for (const acc of ours) gs.unregister(acc)
    ours = []
  }

  function registerAll(hotkeys: CopilotConfig['hotkeys'], handler: (action: HotkeyAction) => void): HotkeyResult[] {
    unregisterAll()
    // Panic first: it must win any accidental duplicate.
    const order = (Object.keys(hotkeys) as HotkeyAction[]).sort((a, b) => Number(b === 'panic') - Number(a === 'panic'))
    const results = order.map((action): HotkeyResult => {
      const accelerator = hotkeys[action]
      const v = validateAccelerator(accelerator)
      if (!v.ok) return { action, accelerator, registered: false, reason: v.reason }
      if (ours.includes(accelerator)) return { action, accelerator, registered: false, reason: 'in-use' }
      try {
        if (!gs.register(accelerator, () => handler(action))) return { action, accelerator, registered: false, reason: 'in-use' }
      } catch { return { action, accelerator, registered: false, reason: 'invalid' } }
      ours.push(accelerator)
      return { action, accelerator, registered: true }
    })
    return results
  }

  /** Free-to-use probe for the hotkey editor: registers and immediately releases. */
  function check(accel: string): HotkeyCheck {
    const v = validateAccelerator(accel)
    if (!v.ok) return v
    if (ours.includes(accel)) return { ok: true }
    try {
      if (!gs.register(accel, () => undefined)) return { ok: false, reason: 'in-use' }
      gs.unregister(accel)
      return { ok: true }
    } catch { return { ok: false, reason: 'invalid' } }
  }

  return { registerAll, unregisterAll, check }
}
