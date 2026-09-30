// Wires overlay window + hotkeys + tray + panic + privacy into one session-facing object. No Electron import:
// the real pieces are injected (overlay-runtime.ts), which keeps every rule here unit-testable.
// Session code (WP3) calls `publishState` for every state change and `setSessionHooks` once; it never touches
// the window, tray or shortcuts directly.
import type { OverlayController } from './overlay-window'
import type { HotkeyAction, HotkeyResult } from './hotkeys'
import { createPanicController } from './panic'
import { PRIVACY_NOTICE_VERSION } from './privacy-mode'
import type { TrayController } from './tray'
import type { CopilotApi, CopilotConfig, CopilotEvents, CopilotState, DeepPartial, StopReason } from './types'

export type SessionHooks = { stopCapture(): Promise<void> | void; abortRequests(): void }
export type HostDeps = {
  overlay: OverlayController
  hotkeys: { registerAll(h: CopilotConfig['hotkeys'], cb: (a: HotkeyAction) => void): HotkeyResult[]; unregisterAll(): void; check(a: string): { ok: boolean; reason?: 'in-use' | 'reserved' | 'invalid' } }
  tray: TrayController
  /** Broadcast a push event to every renderer (`careerloom:<name>`). */
  publish<K extends keyof CopilotEvents>(name: K, payload: CopilotEvents[K]): void
  getConfig(): CopilotConfig
  writeConfig(patch: DeepPartial<CopilotConfig>): CopilotConfig
  restorePrivacy(): void
  app: { on(event: 'before-quit', cb: () => void): unknown }
  proc: { on(event: 'uncaughtExceptionMonitor', cb: () => void): unknown }
}

type OverlayCmd = Parameters<CopilotApi['copilotOverlay']>[0]
const ACTIONS = new Set<HotkeyAction>(['answer', 'followup', 'clarify', 'screenshot', 'summarise', 'listen'])
const configKey = (c: CopilotConfig): string => JSON.stringify([c.overlay, c.privacy, c.hotkeys])

export function createOverlayHost(deps: HostDeps) {
  let hooks: SessionHooks = { stopCapture: () => undefined, abortRequests: () => undefined }
  let live = false
  let lastState: CopilotEvents['copilotState'] | null = null
  let quickHidden = false
  let capturing = false
  let replayOnBeat = false
  let lastKey = configKey(deps.getConfig())
  const actionListeners: Array<(a: HotkeyAction) => void> = []

  const panic = createPanicController({
    stopCapture: () => hooks.stopCapture(),
    abortRequests: () => hooks.abortRequests(),
    hideOverlay: () => { deps.hotkeys.unregisterAll(); deps.overlay.close() },
    restorePrivacy: deps.restorePrivacy,
    setTrayState: s => deps.tray.setState(s),
    notify: () => publishState({ state: 'stopped', mode: lastState?.mode ?? 'live', sessionId: lastState?.sessionId ?? null, sources: [], startedAt: lastState?.startedAt ?? null }),
    isLive: () => live,
    app: deps.app, proc: deps.proc,
    log: (step, err) => console.error(`copilot panic: ${step} failed:`, err),
  })
  deps.tray.onStopNow(() => { void stop('panic') })
  deps.overlay.onGone(() => { void panic.trigger('error') })
  // A window that opens after the state was published would miss it: replay the current state once it has loaded.
  // `load` can fire before the page's React tree subscribes, so the first heartbeat after a load replays it once more.
  deps.overlay.onLoaded(() => { replayOnBeat = true; if (lastState) deps.publish('copilotState', lastState) })
  panic.arm()

  function onHotkey(action: HotkeyAction): void {
    if (action === 'panic') void panic.trigger('panic')
    else if (action === 'expand') deps.overlay.apply({ collapse: deps.getConfig().overlay.layout === 'panel' })
    else if (action === 'toggle') deps.overlay.apply({ hide: deps.overlay.isVisible() })
    else if (action === 'quickHide') { quickHidden = !quickHidden; deps.overlay.apply({ quickHide: quickHidden }) }
    else if (ACTIONS.has(action)) for (const cb of actionListeners) cb(action)
  }

  function registerHotkeys(): void {
    for (const r of deps.hotkeys.registerAll(deps.getConfig().hotkeys, onHotkey)) {
      if (!r.registered) deps.publish('copilotError', { kind: 'hotkey', message: `${r.accelerator} could not be registered (${r.reason ?? 'unknown'})`, retrying: false })
    }
  }

  /** Every capture-state change goes through here: window, tray, hotkeys and renderers stay in step. */
  function publishState(s: CopilotEvents['copilotState']): void {
    const wasLive = live
    capturing = s.state === 'listening' || s.state === 'armed'
    live = s.state === 'listening'
    if (capturing && !wasLive && lastState?.sessionId !== s.sessionId) { panic.reset(); quickHidden = false }
    lastState = s
    deps.tray.setState(s.state satisfies CopilotState)
    deps.overlay.setLive(live)
    if (capturing) { deps.overlay.open(); registerHotkeys() }
    else deps.hotkeys.unregisterAll() // the overlay may stay open on the stopped card; the keys go back to other apps
    deps.publish('copilotState', s)
  }

  async function stop(reason: StopReason): Promise<void> {
    if (reason !== 'user') return panic.trigger(reason)
    try { await hooks.stopCapture(); hooks.abortRequests() } catch (err) { console.error('copilot stop failed:', err) }
    publishState({ state: 'stopped', mode: lastState?.mode ?? 'live', sessionId: lastState?.sessionId ?? null, sources: [], startedAt: lastState?.startedAt ?? null })
  }

  return {
    publishState,
    publish: deps.publish,
    onOverlayLoaded(cb: () => void): void { deps.overlay.onLoaded(cb) },
    stop,
    setSessionHooks(h: SessionHooks): void { hooks = h },
    onAction(cb: (a: HotkeyAction) => void): void { actionListeners.push(cb) },
    /** `copilotOverlay`: an empty command is the renderer's heartbeat (and notices config changes). */
    overlayCommand(cmd: OverlayCmd): void {
      if (Object.values(cmd).every(v => v === undefined)) {
        panic.heartbeat()
        if (replayOnBeat && lastState) { replayOnBeat = false; deps.publish('copilotState', lastState) }
        // ponytail: one small file read per second; a config-changed event replaces this if it ever shows up in a profile.
        const key = configKey(deps.getConfig())
        if (key !== lastKey) { lastKey = key; deps.overlay.refresh(); if (capturing) registerHotkeys() }
        return
      }
      deps.overlay.apply(cmd)
    },
    /** Privacy mode flags count only after the current notice is acknowledged here (main-side). */
    ackPrivacyNotice(version: string): { ok: boolean } {
      if (version !== PRIVACY_NOTICE_VERSION) return { ok: false }
      deps.writeConfig({ privacy: { mode: { noticeVersion: version } } })
      lastKey = configKey(deps.getConfig())
      deps.overlay.refresh()
      return { ok: true }
    },
    checkHotkey: (accel: string) => deps.hotkeys.check(accel),
    isLive: () => live,
  }
}
export type OverlayHost = ReturnType<typeof createOverlayHost>
