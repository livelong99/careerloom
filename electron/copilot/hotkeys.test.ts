import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_CONFIG } from './config'
import { createHotkeyService, validateAccelerator } from './hotkeys'

/** globalShortcut double: `taken` accelerators belong to another app (register returns false). */
function fakeShortcuts(taken: string[] = [], throwFor: string[] = []) {
  const live = new Map<string, () => void>()
  return {
    live,
    register: vi.fn((acc: string, cb: () => void) => {
      if (throwFor.includes(acc)) throw new TypeError(`Invalid accelerator: ${acc}`)
      if (taken.includes(acc) || live.has(acc)) return false
      live.set(acc, cb)
      return true
    }),
    unregister: vi.fn((acc: string) => { live.delete(acc) }),
    unregisterAll: vi.fn(() => { live.clear() }),
    isRegistered: (acc: string) => live.has(acc),
  }
}

describe('validateAccelerator', () => {
  it.each(['Control+Alt+A', 'Control+Alt+Shift+X', 'CommandOrControl+Shift+F5', 'Alt+Space'])('accepts %s', a => {
    expect(validateAccelerator(a)).toEqual({ ok: true })
  })
  it.each(['', 'A', 'Control+', 'Control+Alt', 'Hyper+A', 'Control+Alt+AB'])('rejects %j as invalid', a => {
    expect(validateAccelerator(a)).toEqual({ ok: false, reason: 'invalid' })
  })
  it.each(['Command+Q', 'Command+Tab', 'Command+Space', 'Control+Command+Q'])('refuses the system shortcut %s', a => {
    expect(validateAccelerator(a)).toEqual({ ok: false, reason: 'reserved' })
  })
})

describe('HotkeyService', () => {
  it('registers every default hotkey and routes each callback to its action', () => {
    const gs = fakeShortcuts()
    const svc = createHotkeyService(gs)
    const fired: string[] = []
    const results = svc.registerAll(DEFAULT_CONFIG.hotkeys, a => fired.push(a))
    expect(results.every(r => r.registered)).toBe(true)
    expect(results).toHaveLength(Object.keys(DEFAULT_CONFIG.hotkeys).length)
    gs.live.get('Control+Alt+Shift+X')?.()
    gs.live.get('Control+Alt+A')?.()
    expect(fired).toEqual(['panic', 'answer'])
  })

  it('reports a conflict instead of swallowing it and keeps the rest working (incl. panic)', () => {
    const gs = fakeShortcuts(['Control+Alt+A'])
    const svc = createHotkeyService(gs)
    const results = svc.registerAll(DEFAULT_CONFIG.hotkeys, () => undefined)
    const answer = results.find(r => r.action === 'answer')
    expect(answer).toMatchObject({ registered: false, reason: 'in-use' })
    expect(results.find(r => r.action === 'panic')?.registered).toBe(true)
    expect(gs.live.has('Control+Alt+A')).toBe(false)
  })

  it('an accelerator Electron rejects (throws) is reported invalid, not crashed on', () => {
    const svc = createHotkeyService(fakeShortcuts([], ['Control+Alt+C']))
    const r = svc.registerAll(DEFAULT_CONFIG.hotkeys, () => undefined).find(x => x.action === 'clarify')
    expect(r).toMatchObject({ registered: false, reason: 'invalid' })
  })

  it('the same accelerator on two actions: the second is in-use, panic always wins', () => {
    const gs = fakeShortcuts()
    const svc = createHotkeyService(gs)
    const clash = { ...DEFAULT_CONFIG.hotkeys, answer: 'Control+Alt+Shift+X' }
    const results = svc.registerAll(clash, () => undefined)
    expect(results.find(r => r.action === 'panic')?.registered).toBe(true)
    expect(results.find(r => r.action === 'answer')).toMatchObject({ registered: false, reason: 'in-use' })
  })

  it('re-registering replaces the previous set', () => {
    const gs = fakeShortcuts()
    const svc = createHotkeyService(gs)
    svc.registerAll(DEFAULT_CONFIG.hotkeys, () => undefined)
    const results = svc.registerAll(DEFAULT_CONFIG.hotkeys, () => undefined)
    expect(results.every(r => r.registered)).toBe(true)
  })

  it('unregisterAll frees only our shortcuts', () => {
    const gs = fakeShortcuts()
    const svc = createHotkeyService(gs)
    svc.registerAll(DEFAULT_CONFIG.hotkeys, () => undefined)
    svc.unregisterAll()
    expect(gs.live.size).toBe(0)
    expect(gs.unregisterAll).not.toHaveBeenCalled()
  })

  it('check(): invalid, reserved, in-use by another app, free; the probe never leaks a registration', () => {
    const gs = fakeShortcuts(['Control+Alt+K'])
    const svc = createHotkeyService(gs)
    expect(svc.check('nope')).toEqual({ ok: false, reason: 'invalid' })
    expect(svc.check('Command+Q')).toEqual({ ok: false, reason: 'reserved' })
    expect(svc.check('Control+Alt+K')).toEqual({ ok: false, reason: 'in-use' })
    expect(svc.check('Control+Alt+J')).toEqual({ ok: true })
    expect(gs.live.size).toBe(0)
  })
})

describe('round-2 hardening', () => {
  it.each(['Alt+F4', 'Alt+Tab', 'Control+Alt+Delete', 'Control+Shift+Escape', 'Super+L'])('refuses the Windows system shortcut %s', a => {
    expect(validateAccelerator(a)).toEqual({ ok: false, reason: 'reserved' })
  })
  it('a duplicate spelled differently (order, case, aliases) is still a duplicate, in registerAll and check', () => {
    const gs = fakeShortcuts()
    const svc = createHotkeyService(gs)
    const results = svc.registerAll({ ...DEFAULT_CONFIG.hotkeys, answer: 'alt+control+x', followup: 'Control+Alt+X', panic: 'Control+Alt+Shift+Q' }, () => undefined)
    expect(results.find(r => r.action === 'answer')).toMatchObject({ registered: true })
    expect(results.find(r => r.action === 'followup')).toMatchObject({ registered: false, reason: 'in-use' })
    expect(svc.check('Ctrl+Option+X')).toEqual({ ok: true }) // ours: not another app's
  })
  it('registerAll can be limited to some actions (the idle card only needs Listen)', () => {
    const gs = fakeShortcuts()
    const svc = createHotkeyService(gs)
    const results = svc.registerAll(DEFAULT_CONFIG.hotkeys, () => undefined, ['listen'])
    expect(results.map(r => r.action)).toEqual(['listen'])
    expect(gs.live.size).toBe(1)
  })
})

