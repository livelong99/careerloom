// The real-Electron side of the overlay host: builds the window/tray/shortcut adapters once, on first use.
// Everything testable lives in overlay-host.ts; this file is glue and is covered by the manual macOS checks.
import { app, BrowserWindow, globalShortcut, Menu, nativeImage, screen, Tray } from 'electron'
import path from 'node:path'

import { broadcast } from '../context'
import { readCopilotConfig, writeCopilotConfig } from './config'
import { createHotkeyService } from './hotkeys'
import { createOverlayHost, type OverlayHost } from './overlay-host'
import { createOverlayController } from './overlay-window'
import { parseFakeSpec, runFake } from './overlay-fake'
import { createPrivacyMode } from './privacy-mode'
import { createTrayController } from './tray'
import { statusIconPng, idleRgb } from './tray-icons'

let host: OverlayHost | null = null

export function getOverlayHost(): OverlayHost {
  if (host) return host
  const privacy = createPrivacyMode({ dock: process.platform === 'darwin' ? app.dock : undefined })
  const overlay = createOverlayController({
    createWindow: opts => new BrowserWindow(opts),
    displays: { all: () => screen.getAllDisplays().map(d => ({ id: d.id, workArea: d.workArea })), primary: () => { const d = screen.getPrimaryDisplay(); return { id: d.id, workArea: d.workArea } } },
    getConfig: readCopilotConfig, privacy, platform: process.platform,
    devUrl: process.env.VITE_DEV_SERVER_URL, htmlFile: path.join(__dirname, '..', '..', 'renderer', 'overlay.html'), preload: path.join(__dirname, '..', 'preload.js'),
    persist: patch => { writeCopilotConfig({ overlay: patch }) },
  })
  // A monitor unplugged / resolution or Dock/taskbar change: re-anchor on the (possibly new) work area instead of leaving the card off-screen.
  const reanchor = (): void => overlay.refresh()
  screen.on('display-added', reanchor); screen.on('display-removed', reanchor); screen.on('display-metrics-changed', reanchor)
  const tray = createTrayController({
    createTray: image => new Tray(image as Electron.NativeImage),
    icon: kind => { const img = nativeImage.createFromBuffer(statusIconPng(kind, 36, idleRgb()), { scaleFactor: 2 }); img.setTemplateImage(kind === 'idle'); return img },
    menu: items => Menu.buildFromTemplate(items),
  })
  host = createOverlayHost({
    overlay, hotkeys: createHotkeyService(globalShortcut), tray,
    publish: (name, payload) => broadcast(`careerloom:${name}`, payload),
    getConfig: readCopilotConfig, writeConfig: writeCopilotConfig, restorePrivacy: privacy.restoreAll,
    app, proc: process,
  })
  return host
}

/** Dev only: `CL_COPILOT_FAKE=cycle|<state>` opens the overlay and plays the fake event generator. */
export function startFakeOverlayIfRequested(): void {
  const spec = parseFakeSpec(process.env.CL_COPILOT_FAKE)
  if (!spec || app.isPackaged || process.platform !== 'darwin') return
  const h = getOverlayHost()
  let stopFake: (() => void) | null = null
  const play = (s: NonNullable<typeof spec>) => {
    stopFake?.()
    stopFake = runFake(e => (e.name === 'copilotState' ? h.publishState(e.payload) : h.publish(e.name, e.payload)), s)
  }
  h.setSessionHooks({ stopCapture: () => { stopFake?.(); stopFake = null }, abortRequests: () => undefined })
  h.onAction(a => { if (a === 'listen') play(spec === 'cycle' ? 'cycle' : spec) })
  if (spec !== 'cycle') h.onOverlayLoaded(() => play(spec)) // a fixed state is replayed once the page can hear it
  if (spec !== 'idle') play(spec)
  else { h.publishState({ state: 'idle', mode: 'live', sessionId: null, sources: [], startedAt: null }); h.overlayCommand({ hide: false }) }
}
