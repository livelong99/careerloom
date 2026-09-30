import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_CONFIG } from './config'
import { createOverlayHost, type HostDeps } from './overlay-host'
import { PRIVACY_NOTICE_VERSION } from './privacy-mode'
import type { CopilotConfig } from './types'

function setup(cfg: CopilotConfig = DEFAULT_CONFIG) {
  let config = cfg
  const calls: string[] = []
  const overlay = {
    open: vi.fn(() => { calls.push('open') }), close: vi.fn(() => { calls.push('close') }), apply: vi.fn(), isVisible: vi.fn(() => true),
    setLive: vi.fn(), refresh: vi.fn(), onGone: vi.fn(), onLoaded: vi.fn(), send: vi.fn(),
  }
  const hotkeys = { registerAll: vi.fn(() => [] as ReturnType<HostDeps['hotkeys']['registerAll']>), unregisterAll: vi.fn(), check: vi.fn(() => ({ ok: true })) }
  const tray = { setState: vi.fn(), onStopNow: vi.fn(), destroy: vi.fn() }
  const panicHooks = { stopCapture: vi.fn(async () => { calls.push('capture') }), abortRequests: vi.fn() }
  const published: Array<[string, unknown]> = []
  const writes: unknown[] = []
  const deps: HostDeps = {
    overlay, hotkeys, tray, publish: (n, p) => { published.push([n, p]) }, getConfig: () => config,
    writeConfig: patch => { writes.push(patch); config = { ...config, privacy: { ...config.privacy, mode: { ...config.privacy.mode, ...(patch.privacy?.mode ?? {}) } } } as CopilotConfig; return config },
    restorePrivacy: vi.fn(), app: { on: vi.fn() }, proc: { on: vi.fn() },
  }
  const host = createOverlayHost(deps)
  host.setSessionHooks(panicHooks)
  const hotkeyHandler = () => (hotkeys.registerAll.mock.calls.at(-1) as unknown as [unknown, (a: string) => void])[1]
  return { host, overlay, hotkeys, tray, deps, panicHooks, published, writes, calls, hotkeyHandler, setConfig: (c: CopilotConfig) => { config = c } }
}
const listening = { state: 'listening' as const, mode: 'live' as const, sessionId: 's', sources: ['mic' as const], startedAt: 1 }

describe('overlay host wiring', () => {
  it('publishing a listening state opens the overlay, registers hotkeys, updates tray and live flag', () => {
    const { host, overlay, hotkeys, tray, published } = setup()
    host.publishState(listening)
    expect(overlay.open).toHaveBeenCalled()
    expect(hotkeys.registerAll).toHaveBeenCalled()
    expect(tray.setState).toHaveBeenLastCalledWith('listening')
    expect(overlay.setLive).toHaveBeenLastCalledWith(true)
    expect(published[0]).toEqual(['copilotState', listening])
  })

  it('panic hotkey stops capture first, closes the overlay, frees every hotkey and broadcasts stopped', async () => {
    const { host, hotkeyHandler, calls, overlay, hotkeys, published, deps } = setup()
    host.publishState(listening)
    hotkeyHandler()('panic')
    await vi.waitFor(() => expect(overlay.close).toHaveBeenCalled())
    expect(calls.slice(0, 2)).toEqual(['open', 'capture'])
    expect(hotkeys.unregisterAll).toHaveBeenCalled()
    expect(deps.restorePrivacy).toHaveBeenCalled()
    expect(published.at(-1)).toEqual(['copilotState', expect.objectContaining({ state: 'stopped' })])
  })

  it('replays the state again on the first heartbeat after a load: the page may not have subscribed yet at load time', () => {
    const { host, overlay, published } = setup()
    host.publishState(listening)
    const loaded = (overlay.onLoaded.mock.calls.at(0) as unknown as [() => void])[0]
    loaded()
    const before = published.filter(p => p[0] === 'copilotState').length
    host.overlayCommand({}) // the renderer is alive and subscribed
    expect(published.filter(p => p[0] === 'copilotState').length).toBe(before + 1)
    host.overlayCommand({})
    expect(published.filter(p => p[0] === 'copilotState').length).toBe(before + 1) // only once per load
  })

  it('replays the current state once the overlay page has loaded', () => {
    const { host, overlay, published } = setup()
    host.publishState(listening)
    const loaded = (overlay.onLoaded.mock.calls.at(0) as unknown as [() => void])[0]
    published.length = 0
    loaded()
    expect(published).toEqual([['copilotState', listening]])
  })

  it('tray "Stop now" is wired to panic', async () => {
    const { host, tray, panicHooks } = setup()
    host.publishState(listening)
    const cb = (tray.onStopNow.mock.calls.at(-1) as unknown as [() => void])[0]
    cb()
    await vi.waitFor(() => expect(panicHooks.stopCapture).toHaveBeenCalled())
  })

  it('expand toggles strip/panel from the persisted layout; toggle hides/shows; quickHide toggles', () => {
    const { host, overlay, hotkeyHandler } = setup() // default layout = strip
    host.publishState(listening)
    hotkeyHandler()('expand')
    expect(overlay.apply).toHaveBeenLastCalledWith({ collapse: false })
    hotkeyHandler()('toggle')
    expect(overlay.apply).toHaveBeenLastCalledWith({ hide: true })
    hotkeyHandler()('quickHide')
    expect(overlay.apply).toHaveBeenLastCalledWith({ quickHide: true })
    hotkeyHandler()('quickHide')
    expect(overlay.apply).toHaveBeenLastCalledWith({ quickHide: false })
  })

  it('answer-type hotkeys go to action listeners (engine attaches later)', () => {
    const { host, hotkeyHandler } = setup()
    const seen: string[] = []
    host.onAction(a => seen.push(a))
    host.publishState(listening)
    hotkeyHandler()('answer')
    hotkeyHandler()('summarise')
    expect(seen).toEqual(['answer', 'summarise'])
  })

  it('a hotkey that cannot be registered is published as a hotkey error', () => {
    const { host, hotkeys, published } = setup()
    hotkeys.registerAll.mockReturnValueOnce([{ action: 'answer', accelerator: 'Control+Alt+A', registered: false, reason: 'in-use' }])
    host.publishState(listening)
    expect(published.find(([n]) => n === 'copilotError')?.[1]).toMatchObject({ kind: 'hotkey', retrying: false })
  })

  it('overlay commands: empty = heartbeat (no window change); others go to the window', () => {
    const { host, overlay } = setup()
    host.overlayCommand({})
    expect(overlay.apply).not.toHaveBeenCalled()
    host.overlayCommand({ moveTo: 'bl' })
    expect(overlay.apply).toHaveBeenCalledWith({ moveTo: 'bl' })
  })

  it('a config change seen on a heartbeat refreshes the overlay', () => {
    const { host, overlay, setConfig } = setup()
    host.overlayCommand({})
    expect(overlay.refresh).not.toHaveBeenCalled()
    setConfig({ ...DEFAULT_CONFIG, overlay: { ...DEFAULT_CONFIG.overlay, width: 500 } })
    host.overlayCommand({})
    expect(overlay.refresh).toHaveBeenCalledTimes(1)
    host.overlayCommand({})
    expect(overlay.refresh).toHaveBeenCalledTimes(1)
  })

  it('copilotStop(user) stops capture but keeps the overlay (shows the stopped panel)', async () => {
    const { host, overlay, panicHooks, published } = setup()
    host.publishState(listening)
    await host.stop('user')
    expect(panicHooks.stopCapture).toHaveBeenCalled()
    expect(overlay.close).not.toHaveBeenCalled()
    expect(published.at(-1)).toEqual(['copilotState', expect.objectContaining({ state: 'stopped' })])
  })

  it('a normal stop frees the global hotkeys, and a config change while stopped does not claim them again', async () => {
    const { host, hotkeys, setConfig } = setup()
    host.publishState(listening)
    hotkeys.registerAll.mockClear()
    await host.stop('user')
    expect(hotkeys.unregisterAll).toHaveBeenCalled()
    setConfig({ ...DEFAULT_CONFIG, overlay: { ...DEFAULT_CONFIG.overlay, width: 500 } })
    host.overlayCommand({})
    expect(hotkeys.registerAll).not.toHaveBeenCalled()
  })

  it('copilotStop(panic|error) is the kill switch', async () => {
    const { host, overlay } = setup()
    host.publishState(listening)
    await host.stop('panic')
    expect(overlay.close).toHaveBeenCalled()
  })

  it('a new session after a panic can be stopped again', async () => {
    const { host, panicHooks } = setup()
    host.publishState(listening)
    await host.stop('panic')
    host.publishState({ ...listening, sessionId: 's2' })
    await host.stop('panic')
    expect(panicHooks.stopCapture).toHaveBeenCalledTimes(2)
  })

  it('ack stores only the current notice version, then refreshes the overlay', () => {
    const { host, writes, overlay } = setup()
    expect(host.ackPrivacyNotice('old')).toEqual({ ok: false })
    expect(writes).toHaveLength(0)
    expect(host.ackPrivacyNotice(PRIVACY_NOTICE_VERSION)).toEqual({ ok: true })
    expect(writes[0]).toEqual({ privacy: { mode: { noticeVersion: PRIVACY_NOTICE_VERSION } } })
    expect(overlay.refresh).toHaveBeenCalled()
  })

  it('live state drives the tray from capture state in every indicator setting', () => {
    for (const indicator of ['chip', 'dot', 'off'] as const) {
      const cfg = { ...DEFAULT_CONFIG, privacy: { ...DEFAULT_CONFIG.privacy, mode: { ...DEFAULT_CONFIG.privacy.mode, enabled: true, noticeVersion: PRIVACY_NOTICE_VERSION, indicator } } }
      const { host, tray } = setup(cfg)
      host.publishState(listening)
      expect(tray.setState).toHaveBeenLastCalledWith('listening')
      host.publishState({ ...listening, state: 'stopped' })
      expect(tray.setState).toHaveBeenLastCalledWith('stopped')
    }
  })
})
