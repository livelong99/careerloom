import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_CONFIG } from './config'
import { anchorBounds, createOverlayController, overlaySize, type OverlayDeps } from './overlay-window'
import { createPrivacyMode, PRIVACY_NOTICE_VERSION } from './privacy-mode'
import type { Anchor, CopilotConfig } from './types'

const WORK = { x: 0, y: 25, width: 1440, height: 875 } // menu bar offset like macOS
const SIZE = { width: 440, height: 600 }

describe('anchorBounds', () => {
  const at = (a: Anchor) => anchorBounds(a, WORK, SIZE, 16)
  it.each<[Anchor, number, number]>([
    ['tl', 16, 41], ['tc', 500, 41], ['tr', 984, 41],
    ['ml', 16, 162.5], ['c', 500, 162.5], ['mr', 984, 162.5],
    ['bl', 16, 284], ['bc', 500, 284], ['br', 984, 284],
  ])('%s', (a, x, y) => { expect(at(a)).toMatchObject({ x: Math.round(x), y: Math.round(y), ...SIZE }) })

  it('respects a second display offset (negative and large origins)', () => {
    expect(anchorBounds('tl', { x: -1920, y: 0, width: 1920, height: 1080 }, SIZE, 16)).toMatchObject({ x: -1904, y: 16 })
    expect(anchorBounds('br', { x: 1440, y: 0, width: 2560, height: 1440 }, SIZE, 16)).toMatchObject({ x: 1440 + 2560 - 440 - 16, y: 1440 - 600 - 16 })
  })

  it('shrinks a window that would not fit the work area', () => {
    const b = anchorBounds('tl', { x: 0, y: 0, width: 400, height: 500 }, { width: 780, height: 700 }, 16)
    expect(b).toMatchObject({ width: 368, height: 468 })
  })
})

describe('overlaySize', () => {
  it('strip is the fixed 780 px row; panel follows the width setting', () => {
    expect(overlaySize('strip', DEFAULT_CONFIG.overlay).width).toBe(780)
    expect(overlaySize('panel', { ...DEFAULT_CONFIG.overlay, width: 520 }).width).toBe(520)
  })
})

class FakeWin {
  static all: FakeWin[] = []
  opts: Record<string, unknown>
  destroyed = false
  visible = false
  handlers = new Map<string, Array<(...a: unknown[]) => void>>()
  webContents = {
    send: vi.fn(), reload: vi.fn(),
    on: vi.fn((e: string, cb: (...a: unknown[]) => void) => { this.add('wc:' + e, cb) }),
    setWindowOpenHandler: vi.fn(),
  }
  setBounds = vi.fn(); showInactive = vi.fn(() => { this.visible = true }); show = vi.fn(); focus = vi.fn(); hide = vi.fn(() => { this.visible = false })
  setAlwaysOnTop = vi.fn(); setVisibleOnAllWorkspaces = vi.fn(); setIgnoreMouseEvents = vi.fn(); setOpacity = vi.fn()
  setContentProtection = vi.fn(); setTitle = vi.fn(); close = vi.fn(() => { this.destroyed = true; this.fire('closed') })
  loadURL = vi.fn(() => Promise.resolve()); loadFile = vi.fn(() => Promise.resolve())
  constructor(opts: Record<string, unknown>) { this.opts = opts; FakeWin.all.push(this) }
  add(e: string, cb: (...a: unknown[]) => void) { this.handlers.set(e, [...(this.handlers.get(e) ?? []), cb]) }
  on(e: string, cb: (...a: unknown[]) => void) { this.add(e, cb); return this }
  once(e: string, cb: (...a: unknown[]) => void) { this.add(e, cb); return this }
  fire(e: string, ...a: unknown[]) { for (const cb of this.handlers.get(e) ?? []) cb(...a) }
  isDestroyed() { return this.destroyed }
  isVisible() { return this.visible }
}

function setup(over: { cfg?: Partial<CopilotConfig>; displays?: Array<{ id: number; workArea: typeof WORK }>; platform?: NodeJS.Platform; devUrl?: string } = {}) {
  FakeWin.all = []
  let cfg: CopilotConfig = { ...DEFAULT_CONFIG, ...over.cfg }
  const dock = { hide: vi.fn(), show: vi.fn(() => Promise.resolve()) }
  const privacy = createPrivacyMode({ dock })
  const displays = over.displays ?? [{ id: 1, workArea: WORK }]
  const persisted: Array<Partial<{ anchor: Anchor; layout: 'strip' | 'panel' }>> = []
  const deps: OverlayDeps = {
    createWindow: o => new FakeWin(o as Record<string, unknown>) as never,
    displays: { all: () => displays, primary: () => displays[0]! },
    getConfig: () => cfg,
    privacy, platform: over.platform ?? 'darwin', devUrl: over.devUrl, htmlFile: '/app/renderer/overlay.html',
    persist: p => { persisted.push(p) },
  }
  const ctl = createOverlayController(deps)
  return { ctl, dock, persisted, win: () => FakeWin.all.at(-1)!, setCfg: (c: CopilotConfig) => { cfg = c } }
}

describe('overlay window', () => {
  it('is frameless, transparent, non-focusable, skipTaskbar, sandboxed, webSecurity untouched, neutral constant title', () => {
    const { ctl, win } = setup()
    ctl.open()
    const o = win().opts
    expect(o).toMatchObject({ frame: false, transparent: true, focusable: false, skipTaskbar: true, show: false, hasShadow: false, resizable: false, title: 'Careerloom Copilot', type: 'panel' })
    const wp = o.webPreferences as Record<string, unknown>
    expect(wp).toMatchObject({ sandbox: true, contextIsolation: true, nodeIntegration: false, backgroundThrottling: false })
    expect(wp.webSecurity).not.toBe(false)
    expect(wp.allowRunningInsecureContent).not.toBe(true)
  })

  it('shows inactive only and never takes focus', () => {
    const { ctl, win } = setup()
    ctl.open()
    win().fire('ready-to-show')
    expect(win().showInactive).toHaveBeenCalled()
    ctl.apply({ hide: false })
    ctl.apply({ quickHide: false })
    expect(win().show).not.toHaveBeenCalled()
    expect(win().focus).not.toHaveBeenCalled()
  })

  it('floats above full-screen apps on every Space when allowed, without the Dock transform', () => {
    const { ctl, win } = setup()
    ctl.open()
    expect(win().setAlwaysOnTop).toHaveBeenCalledWith(true, 'screen-saver')
    expect(win().setVisibleOnAllWorkspaces).toHaveBeenCalledWith(true, { visibleOnFullScreen: true, skipTransformProcessType: true })
  })

  it('uses the lower level when "above full-screen" is off', () => {
    const { ctl, win } = setup({ cfg: { overlay: { ...DEFAULT_CONFIG.overlay, aboveFullscreen: false } } })
    ctl.open()
    expect(win().setAlwaysOnTop).toHaveBeenCalledWith(true, 'floating')
  })

  it('positions on the configured display/anchor; unknown displayId falls back to primary', () => {
    const second = { id: 7, workArea: { x: 1440, y: 0, width: 1920, height: 1080 } }
    const a = setup({ cfg: { overlay: { ...DEFAULT_CONFIG.overlay, layout: 'panel', anchor: 'tl', displayId: 7 } }, displays: [{ id: 1, workArea: WORK }, second] })
    a.ctl.open()
    expect(a.win().setBounds).toHaveBeenLastCalledWith(expect.objectContaining({ x: 1456, y: 16 }))
    const b = setup({ cfg: { overlay: { ...DEFAULT_CONFIG.overlay, layout: 'panel', anchor: 'tl', displayId: 99 } } })
    b.ctl.open()
    expect(b.win().setBounds).toHaveBeenLastCalledWith(expect.objectContaining({ x: 16, y: 41 }))
  })

  it('collapse resizes between strip and panel, tells the renderer and persists', () => {
    const { ctl, win, persisted } = setup({ cfg: { overlay: { ...DEFAULT_CONFIG.overlay, layout: 'panel' } } })
    ctl.open()
    ctl.apply({ collapse: true })
    expect(win().setBounds).toHaveBeenLastCalledWith(expect.objectContaining({ width: 780 }))
    expect(win().webContents.send).toHaveBeenCalledWith('careerloom:copilotOverlayCmd', expect.objectContaining({ layout: 'strip' }))
    expect(persisted.at(-1)).toEqual({ layout: 'strip' })
    ctl.apply({ collapse: false })
    expect(win().setBounds).toHaveBeenLastCalledWith(expect.objectContaining({ width: 440 }))
  })

  it('moveTo re-anchors and persists', () => {
    const { ctl, win, persisted } = setup({ cfg: { overlay: { ...DEFAULT_CONFIG.overlay, layout: 'panel' } } })
    ctl.open()
    ctl.apply({ moveTo: 'bl' })
    expect(win().setBounds).toHaveBeenLastCalledWith(expect.objectContaining({ x: 16, y: 184 }))
    expect(persisted.at(-1)).toEqual({ anchor: 'bl' })
  })

  it('passive toggles click-through with forwarded mouse-move for hover regions', () => {
    const { ctl, win } = setup()
    ctl.open()
    ctl.apply({ passive: true })
    expect(win().setIgnoreMouseEvents).toHaveBeenLastCalledWith(true, { forward: true })
    ctl.apply({ passive: false })
    expect(win().setIgnoreMouseEvents).toHaveBeenLastCalledWith(false)
  })

  it('starts click-through so the transparent margin never blocks the call', () => {
    const { ctl, win } = setup()
    ctl.open()
    expect(win().setIgnoreMouseEvents).toHaveBeenCalledWith(true, { forward: true })
  })

  it('hide/quick-hide: hide + wipe, capture untouched, second press restores', () => {
    const { ctl, win } = setup()
    ctl.open()
    win().fire('ready-to-show')
    ctl.apply({ quickHide: true })
    expect(win().hide).toHaveBeenCalled()
    expect(win().webContents.send).toHaveBeenCalledWith('careerloom:copilotOverlayCmd', { wipe: true })
    expect(ctl.isVisible()).toBe(false)
    ctl.apply({ quickHide: false })
    expect(win().showInactive).toHaveBeenCalledTimes(2)
    expect(win().webContents.send).toHaveBeenCalledWith('careerloom:copilotOverlayCmd', { wipe: false })
    expect(ctl.isVisible()).toBe(true)
  })

  it('an empty command is a heartbeat and does nothing', () => {
    const { ctl, win } = setup()
    ctl.open()
    const calls = win().setBounds.mock.calls.length
    ctl.apply({})
    expect(win().setBounds.mock.calls.length).toBe(calls)
  })

  it('applies Privacy mode to every window at creation, including later ones, and restores on close', () => {
    const mode = { ...DEFAULT_CONFIG.privacy.mode, enabled: true, noticeVersion: PRIVACY_NOTICE_VERSION, hideFromCapture: true }
    const { ctl, win, setCfg } = setup({ cfg: { privacy: { ...DEFAULT_CONFIG.privacy, mode } } })
    ctl.open()
    const first = win()
    expect(first.setContentProtection).toHaveBeenCalledWith(true)
    ctl.close()
    expect(first.setContentProtection).toHaveBeenLastCalledWith(false)
    setCfg({ ...DEFAULT_CONFIG, privacy: { ...DEFAULT_CONFIG.privacy, mode } })
    ctl.open()
    expect(win()).not.toBe(first)
    expect(win().setContentProtection).toHaveBeenCalledWith(true)
  })

  it('defaults: Privacy mode off never calls setContentProtection(true)', () => {
    const { ctl, win } = setup()
    ctl.open()
    expect(win().setContentProtection).not.toHaveBeenCalledWith(true)
  })

  it('setLive hides the Dock icon only while live (noDockIcon + acked)', () => {
    const mode = { ...DEFAULT_CONFIG.privacy.mode, enabled: true, noticeVersion: PRIVACY_NOTICE_VERSION, noDockIcon: true }
    const { ctl, dock } = setup({ cfg: { privacy: { ...DEFAULT_CONFIG.privacy, mode } } })
    ctl.open()
    expect(dock.hide).not.toHaveBeenCalled()
    ctl.setLive(true)
    expect(dock.hide).toHaveBeenCalledTimes(1)
    ctl.setLive(false)
    expect(dock.show).toHaveBeenCalledTimes(1)
  })

  it('loads the dev URL overlay page or the built file', () => {
    const dev = setup({ devUrl: 'http://127.0.0.1:5173' })
    dev.ctl.open()
    expect(dev.win().loadURL).toHaveBeenCalledWith('http://127.0.0.1:5173/overlay.html')
    const prod = setup()
    prod.ctl.open()
    expect(prod.win().loadFile).toHaveBeenCalledWith('/app/renderer/overlay.html')
  })

  it('a renderer crash notifies listeners and closes the window; a long hang reloads it', () => {
    vi.useFakeTimers()
    const { ctl, win } = setup()
    const gone = vi.fn()
    ctl.onGone(gone)
    ctl.open()
    win().fire('unresponsive')
    vi.advanceTimersByTime(3500)
    expect(win().webContents.reload).toHaveBeenCalled()
    win().fire('responsive')
    win().handlers.get('wc:render-process-gone')?.forEach(cb => cb({}, { reason: 'crashed' }))
    expect(gone).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })

  it('blocks navigation and popups like the main window', () => {
    const { ctl, win } = setup()
    ctl.open()
    const prevent = vi.fn()
    win().handlers.get('wc:will-navigate')?.forEach(cb => cb({ preventDefault: prevent }))
    expect(prevent).toHaveBeenCalled()
    expect(win().webContents.setWindowOpenHandler).toHaveBeenCalled()
  })

  it('close() is safe twice and isVisible() is false when there is no window', () => {
    const { ctl } = setup()
    expect(ctl.isVisible()).toBe(false)
    ctl.open(); ctl.close(); ctl.close()
    expect(ctl.isVisible()).toBe(false)
  })
})
