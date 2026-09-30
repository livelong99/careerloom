// Ported from Open-Cluely (owner's project), adapted for Careerloom: frameless/transparent/always-on-top window,
// showInactive, skipTaskbar, unresponsive recovery, size + move-to-edge (window.js, window-controller.js,
// window-constants.js). Dropped: process-title/app-id/Mission-Control disguise, 0.02 opacity, webSecurity:false.
// Every low-profile flag lives in privacy-mode.ts; this file never calls setContentProtection itself.
import type { BrowserWindow, BrowserWindowConstructorOptions } from 'electron'

import { OVERLAY_CMD_CHANNEL, type OverlayCmdEvent } from './overlay-events'
import { OVERLAY_TITLE, type createPrivacyMode } from './privacy-mode'
import type { Anchor, CopilotApi, CopilotConfig } from './types'

export type OverlayCommand = Parameters<CopilotApi['copilotOverlay']>[0]
type Layout = 'strip' | 'panel'
export type Rect = { x: number; y: number; width: number; height: number }

const MARGIN = 16
const STRIP = { width: 780, height: 96 }
const PANEL_HEIGHT = 700
const PANEL_WIDTH = { min: 360, max: 560 }
const HANG_RELOAD_MS = 3000

/** Fixed-size window per layout; the card inside resizes itself (the rest of the window is click-through). */
export function overlaySize(layout: Layout, ov: CopilotConfig['overlay']): { width: number; height: number } {
  if (layout === 'strip') return STRIP
  return { width: Math.min(PANEL_WIDTH.max, Math.max(PANEL_WIDTH.min, ov.width)), height: PANEL_HEIGHT }
}

/** Pure anchor math on a display's work area (macOS menu bar / Dock already excluded). Never larger than the area. */
export function anchorBounds(anchor: Anchor, area: Rect, size: { width: number; height: number }, margin = MARGIN): Rect {
  const width = Math.min(size.width, area.width - 2 * margin)
  const height = Math.min(size.height, area.height - 2 * margin)
  const left = area.x + margin, right = area.x + area.width - width - margin
  const top = area.y + margin, bottom = area.y + area.height - height - margin
  const x = anchor.endsWith('l') ? left : anchor.endsWith('r') ? right : (area.x + (area.width - width) / 2)
  const y = anchor.startsWith('t') ? top : anchor.startsWith('b') ? bottom : (area.y + (area.height - height) / 2)
  return { x: Math.round(x), y: Math.round(y), width, height }
}

export interface OverlayController {
  open(): void
  close(): void
  apply(cmd: OverlayCommand): void
  isVisible(): boolean
  /** Capture is live: drives the Dock-icon part of Privacy mode. */
  setLive(live: boolean): void
  /** Config changed (size, anchor, display, privacy): re-position and re-apply flags. */
  refresh(): void
  onGone(cb: () => void): void
  /** The overlay page finished loading: events sent before this were missed, so senders replay current state. */
  onLoaded(cb: () => void): void
  /** Presentation commands to the overlay renderer only. */
  send(ev: OverlayCmdEvent): void
}

export type OverlayDeps = {
  createWindow(opts: BrowserWindowConstructorOptions): BrowserWindow
  displays: { all(): Array<{ id: number; workArea: Rect }>; primary(): { id: number; workArea: Rect } }
  getConfig(): CopilotConfig
  privacy: ReturnType<typeof createPrivacyMode>
  platform: NodeJS.Platform
  devUrl?: string
  htmlFile: string
  preload?: string
  /** Persist an anchor/layout the user changed from the overlay. */
  persist(patch: Partial<{ anchor: Anchor; layout: Layout }>): void
}

export function createOverlayController(deps: OverlayDeps): OverlayController {
  let win: BrowserWindow | null = null
  let ready = false
  let wantVisible = false
  let live = false
  let layout: Layout = deps.getConfig().overlay.layout
  let anchor: Anchor = deps.getConfig().overlay.anchor
  let hangTimer: ReturnType<typeof setTimeout> | null = null
  const goneListeners: Array<() => void> = []
  const loadedListeners: Array<() => void> = []
  const alive = (w: BrowserWindow | null): w is BrowserWindow => w !== null && !w.isDestroyed()

  function area(): Rect {
    const id = deps.getConfig().overlay.displayId
    return (deps.displays.all().find(d => d.id === id) ?? deps.displays.primary()).workArea
  }

  function reposition(): void {
    if (!alive(win)) return
    win.setBounds(anchorBounds(anchor, area(), overlaySize(layout, deps.getConfig().overlay)))
  }

  function level(w: BrowserWindow): void {
    const cfg = deps.getConfig().overlay
    w.setAlwaysOnTop(true, cfg.aboveFullscreen ? 'screen-saver' : 'floating')
    // skipTransformProcessType keeps the app's Dock icon; hiding it is Privacy mode's decision alone.
    if (deps.platform === 'darwin') w.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: cfg.aboveFullscreen, skipTransformProcessType: true })
  }

  function showInactive(): void {
    if (alive(win) && ready && wantVisible) win.showInactive()
  }

  function create(): BrowserWindow {
    const w = deps.createWindow({
      width: STRIP.width, height: STRIP.height, show: false, frame: false, transparent: true, hasShadow: false,
      resizable: false, minimizable: false, maximizable: false, fullscreenable: false, skipTaskbar: true, focusable: false,
      title: OVERLAY_TITLE, backgroundColor: '#00000000', ...(deps.platform === 'darwin' ? { type: 'panel' } : {}),
      webPreferences: { preload: deps.preload, contextIsolation: true, nodeIntegration: false, sandbox: true, backgroundThrottling: false },
    })
    win = w
    ready = false
    level(w)
    w.setIgnoreMouseEvents(true, { forward: true }) // the transparent margin must never block the call
    deps.privacy.applyPrivacyMode(w, deps.getConfig().privacy.mode, live)
    reposition()
    w.once('ready-to-show', () => { ready = true; showInactive() })
    w.on('closed', () => { if (win === w) win = null })
    w.on('unresponsive', () => {
      hangTimer ??= setTimeout(() => { hangTimer = null; if (alive(w)) w.webContents.reload() }, HANG_RELOAD_MS)
    })
    w.on('responsive', () => { if (hangTimer) clearTimeout(hangTimer); hangTimer = null })
    w.webContents.on('did-finish-load', () => { for (const cb of loadedListeners) cb() })
    w.webContents.on('will-navigate', e => e.preventDefault())
    w.webContents.setWindowOpenHandler(() => ({ action: 'deny' }))
    w.webContents.on('render-process-gone', () => {
      deps.privacy.restore(w)
      if (alive(w)) w.close()
      for (const cb of goneListeners) cb()
    })
    const load = deps.devUrl ? w.loadURL(`${deps.devUrl}/overlay.html`) : w.loadFile(deps.htmlFile)
    load.catch(err => console.error('Failed to load overlay:', err))
    return w
  }

  const send: OverlayController['send'] = ev => { if (alive(win)) win.webContents.send(OVERLAY_CMD_CHANNEL, ev) }

  function setLayout(next: Layout): void {
    if (next === layout) return
    layout = next
    reposition()
    send({ layout })
    deps.persist({ layout })
  }

  return {
    open() {
      wantVisible = true
      if (!alive(win)) create()
      else showInactive()
    },
    close() {
      wantVisible = false
      if (hangTimer) clearTimeout(hangTimer)
      hangTimer = null
      const w = win
      win = null
      if (!alive(w)) return
      deps.privacy.restore(w)
      w.close()
    },
    apply(cmd) {
      if (cmd.collapse !== undefined) setLayout(cmd.collapse ? 'strip' : 'panel')
      if (cmd.moveTo) { anchor = cmd.moveTo; reposition(); deps.persist({ anchor }) }
      if (cmd.passive !== undefined && alive(win)) {
        if (cmd.passive) win.setIgnoreMouseEvents(true, { forward: true })
        else win.setIgnoreMouseEvents(false)
      }
      if (cmd.quickHide === true) { if (alive(win)) { win.hide(); send({ wipe: true }) } }
      else if (cmd.quickHide === false) { wantVisible = true; showInactive(); send({ wipe: false }) }
      if (cmd.hide === true) { wantVisible = false; if (alive(win)) win.hide() }
      else if (cmd.hide === false) { wantVisible = true; if (!alive(win)) create(); else showInactive() }
    },
    isVisible: () => alive(win) && win.isVisible(),
    setLive(next) {
      live = next
      if (alive(win)) deps.privacy.applyPrivacyMode(win, deps.getConfig().privacy.mode, live)
      else if (!next) deps.privacy.restoreAll()
    },
    refresh() {
      const cfg = deps.getConfig().overlay
      layout = cfg.layout; anchor = cfg.anchor
      if (!alive(win)) return
      level(win)
      reposition()
      deps.privacy.applyPrivacyMode(win, deps.getConfig().privacy.mode, live)
      send({ layout, anchor })
    },
    onGone(cb) { goneListeners.push(cb) },
    onLoaded(cb) { loadedListeners.push(cb) },
    send,
  }
}
