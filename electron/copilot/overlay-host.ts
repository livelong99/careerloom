// Wires overlay window + hotkeys + tray + panic + privacy into one session-facing object. No Electron import:
// the real pieces are injected (overlay-runtime.ts), which keeps every rule here unit-testable.
// Session code (WP3) calls `publishState` for every state change and `setSessionHooks` once; it never touches
// the window, tray or shortcuts directly.
import { debugLog } from '../debug-log'
import type { OverlayController } from './overlay-window'
import type { HotkeyAction, HotkeyResult } from './hotkeys'
import { createPanicController } from './panic'
import { PRIVACY_NOTICE_VERSION } from './privacy-mode'
import type { TrayController } from './tray'
import type { CopilotApi, CopilotConfig, CopilotEvents, CopilotState, DeepPartial, StopReason } from './types'

export type SessionHooks = { stopCapture(): Promise<void> | void; abortRequests(): void }
export type HostDeps = {
  overlay: OverlayController
  hotkeys: { registerAll(h: CopilotConfig['hotkeys'], cb: (a: HotkeyAction) => void, only?: readonly HotkeyAction[]): HotkeyResult[]; unregisterAll(): void; check(a: string): { ok: boolean; reason?: 'in-use' | 'reserved' | 'invalid' } }
  tray: TrayController
  /** Broadcast a push event to every renderer (`careerloom:<name>`). */
  publish<K extends keyof CopilotEvents>(name: K, payload: CopilotEvents[K]): void
  getConfig(): CopilotConfig
  writeConfig(patch: DeepPartial<CopilotConfig>): CopilotConfig
  restorePrivacy(): void
  app: { on(event: 'before-quit', cb: () => void): unknown }
  proc: { on(event: 'uncaughtExceptionMonitor', cb: () => void): unknown }
  now?: () => number
}

type OverlayCmd = Parameters<CopilotApi['copilotOverlay']>[0]
const ACTIONS = new Set<HotkeyAction>(['answer', 'followup', 'clarify', 'screenshot', 'summarise', 'listen', 'clear'])
const REPEAT_MS = 400 // a held key auto-repeats (Windows especially): one press = one request (or one toggle)
const ACTION_NAME: Partial<Record<HotkeyAction, string>> = { answer: 'Answer', followup: 'Follow-up', clarify: 'Clarify', screenshot: 'Screenshot', summarise: 'Summarise', expand: 'Expand or collapse', listen: 'Listen', toggle: 'Show or hide', quickHide: 'Quick hide', clear: 'Clear', panic: 'Stop' }
const REASON_TEXT = { 'in-use': 'is in use by another app', reserved: 'is reserved by the system', invalid: 'is not a valid shortcut' } as const
const configKey = (c: CopilotConfig): string => JSON.stringify([c.overlay, c.privacy, c.hotkeys])

export function createOverlayHost(deps: HostDeps) {
  let hooks: SessionHooks = { stopCapture: () => undefined, abortRequests: () => undefined }
  let live = false
  let lastState: CopilotEvents['copilotState'] | null = null
  let quickHidden = false
  let capturing = false
  let replayOnBeat = false
  let lastKey = configKey(deps.getConfig())
  const now = deps.now ?? Date.now
  const lastPress = new Map<HotkeyAction, number>()
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
    debugLog('hotkey', 'pressed', { action })
    if (action !== 'panic') { // panic is idempotent and must never be swallowed
      const t = now()
      if (t - (lastPress.get(action) ?? -Infinity) < REPEAT_MS) return
      lastPress.set(action, t)
    }
    if (action === 'panic') void panic.trigger('panic')
    else if (action === 'expand') deps.overlay.apply({ collapse: deps.getConfig().overlay.layout === 'panel' })
    else if (action === 'toggle') {
      // Showing a quick-hidden overlay must also un-wipe it, or the next quick-hide would "show" instead of hide.
      if (quickHidden) { quickHidden = false; deps.overlay.apply({ quickHide: false }) }
      else deps.overlay.apply({ hide: deps.overlay.isVisible() })
    }
    else if (action === 'quickHide') { quickHidden = !quickHidden; deps.overlay.apply({ quickHide: quickHidden }) }
    else if (action === 'listen' && capturing) return // already listening: nothing to start (there is no pause)
    else if (ACTIONS.has(action)) for (const cb of actionListeners) cb(action)
  }

  /** `idle`: the overlay is open but not capturing: only Listen is registered (it starts a session), the other keys stay with other apps. */
  function registerHotkeys(idle = false): void {
    const only = idle ? ['listen' as const] : undefined
    const results = only ? deps.hotkeys.registerAll(deps.getConfig().hotkeys, onHotkey, only) : deps.hotkeys.registerAll(deps.getConfig().hotkeys, onHotkey)
    for (const r of results) debugLog('hotkey', r.registered ? 'registered' : 'NOT registered', r)
    const failed = results.filter(r => !r.registered)
    // One message per pass: which shortcut, why, and where to change it.
    for (const r of failed) deps.publish('copilotError', { kind: 'hotkey', message: `${ACTION_NAME[r.action] ?? r.action} shortcut ${r.accelerator} ${REASON_TEXT[r.reason ?? 'invalid']}. Pick another in Copilot › Hotkeys.`, retrying: false })
  }

  /** Every capture-state change goes through here: window, tray, hotkeys and renderers stay in step. */
  function publishState(s: CopilotEvents['copilotState']): void {
    const wasLive = live
    const wasCapturing = capturing
    capturing = s.state === 'listening' || s.state === 'armed'
    live = s.state === 'listening'
    if (capturing && !wasLive && lastState?.sessionId !== s.sessionId) { panic.reset(); quickHidden = false }
    lastState = s
    deps.tray.setState(s.state satisfies CopilotState)
    deps.overlay.setLive(live)
    // Only the start of a session opens the window and claims the keys: later state changes (armed → listening) must not
    // re-show an overlay the user hid, or re-report a shortcut that already failed.
    if (capturing && !wasCapturing) { deps.overlay.open(); registerHotkeys() }
    else if (!capturing) { // the overlay may stay open on the stopped card; the other keys go back to other apps
      if (deps.overlay.isVisible() && s.state !== 'idle') registerHotkeys(true)
      else deps.hotkeys.unregisterAll()
    }
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
      if (!capturing && cmd.hide === true) deps.hotkeys.unregisterAll() // a hidden stopped card must not keep Listen
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
