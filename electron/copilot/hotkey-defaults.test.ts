import { describe, expect, it } from 'vitest'
import { defaultHotkeys, defaultInterruptKey, migrateHotkey, migrateInterruptKey } from './hotkey-defaults'
import { validateAccelerator } from './hotkeys'

describe('platform hotkey defaults', () => {
  it('macOS keeps Control+Alt, Windows avoids AltGr (Ctrl+Alt) and has no duplicates', () => {
    expect(defaultHotkeys('darwin').answer).toBe('Control+Alt+A')
    const win = defaultHotkeys('win32')
    const all = Object.values(win)
    expect(all.some(a => /control/i.test(a) && /alt/i.test(a))).toBe(false)
    expect(new Set(all).size).toBe(all.length)
    expect(all.every(a => validateAccelerator(a).ok)).toBe(true)
    expect(defaultInterruptKey('win32')).toBe('Alt+Shift+I')
    expect(all).not.toContain(defaultInterruptKey('win32'))
  })
  it('moves a saved macOS default to the Windows one, keeps a user choice, never touches macOS', () => {
    expect(migrateHotkey('answer', 'Control+Alt+A', 'win32')).toBe('Alt+Shift+A')
    expect(migrateHotkey('answer', 'Control+Shift+Z', 'win32')).toBe('Control+Shift+Z')
    expect(migrateHotkey('answer', 'Control+Alt+A', 'darwin')).toBe('Control+Alt+A')
    expect(migrateInterruptKey('Control+Alt+I', 'win32')).toBe('Alt+Shift+I')
  })
})

describe('without a Node process (the sandboxed renderer)', () => {
  it('loads and picks defaults from the user agent', async () => {
    const proc = globalThis.process
    // @ts-expect-error simulate the renderer
    globalThis.process = undefined
    try {
      expect(() => defaultInterruptKey()).not.toThrow()
      expect(defaultHotkeys().answer).toMatch(/^(Control\+Alt|Alt\+Shift)\+A$/)
    } finally { globalThis.process = proc }
  })
})
