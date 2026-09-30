import { describe, expect, it, vi } from 'vitest'

import { statusIconPng } from './tray-icons'
import { createTrayController, type TrayDeps } from './tray'

function setup() {
  const tray = { setImage: vi.fn(), setToolTip: vi.fn(), setContextMenu: vi.fn(), destroy: vi.fn() }
  const deps: TrayDeps = {
    createTray: vi.fn(() => tray),
    icon: vi.fn((kind: 'idle' | 'live') => `icon:${kind}`),
    menu: vi.fn((items: unknown) => items),
  }
  const items = () => tray.setContextMenu.mock.calls.at(-1)?.[0] as Array<{ label?: string; enabled?: boolean; click?: () => void }>
  return { tray, deps, ctl: createTrayController(deps), items }
}

describe('tray / menu-bar controller', () => {
  it('shows capture state: live icon only while listening', () => {
    const { ctl, tray } = setup()
    ctl.setState('listening')
    expect(tray.setImage).toHaveBeenLastCalledWith('icon:live')
    for (const s of ['idle', 'armed', 'stopped'] as const) {
      ctl.setState(s)
      expect(tray.setImage).toHaveBeenLastCalledWith('icon:idle')
    }
  })

  it('tooltip and menu text state the capture state in words', () => {
    const { ctl, tray, items } = setup()
    ctl.setState('listening')
    expect(tray.setToolTip).toHaveBeenLastCalledWith('Careerloom Copilot: listening')
    expect(items()[0]?.label).toBe('Listening')
    ctl.setState('stopped')
    expect(items()[0]?.label).toBe('Not listening')
  })

  it('"Stop now" is always present, enabled while armed or listening, and fires the callback', () => {
    const { ctl, items } = setup()
    const cb = vi.fn()
    ctl.onStopNow(cb)
    ctl.setState('idle')
    expect(items().find(i => i.label === 'Stop now')?.enabled).toBe(false)
    ctl.setState('listening')
    const stop = items().find(i => i.label === 'Stop now')
    expect(stop?.enabled).toBe(true)
    stop?.click?.()
    expect(cb).toHaveBeenCalledTimes(1)
    ctl.setState('armed')
    expect(items().find(i => i.label === 'Stop now')?.enabled).toBe(true)
  })

  it('state comes only from capture state, never from an overlay indicator setting (acceptance 6)', () => {
    const { ctl, tray } = setup()
    // The controller has no indicator input at all: dot/off/chip cannot change what the menu bar shows.
    expect(ctl.setState.length).toBe(1)
    ctl.setState('listening')
    expect(tray.setImage).toHaveBeenLastCalledWith('icon:live')
  })

  it('destroy releases the tray', () => {
    const { ctl, tray } = setup()
    ctl.destroy()
    expect(tray.destroy).toHaveBeenCalled()
  })
})

describe('statusIconPng', () => {
  it.each(['idle', 'live'] as const)('%s icon is a valid PNG of the requested size', kind => {
    const png = statusIconPng(kind, 36)
    expect(png.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a')
    expect(png.readUInt32BE(16)).toBe(36) // IHDR width
    expect(png.readUInt32BE(20)).toBe(36) // IHDR height
    expect(png.subarray(-8).toString('latin1')).toContain('IEND')
  })
  it('the two states look different', () => {
    expect(statusIconPng('idle', 36).equals(statusIconPng('live', 36))).toBe(false)
  })
})
