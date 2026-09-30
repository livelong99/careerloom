// Ported from Open-Cluely (owner's project), adapted for Careerloom: emergency hide (window-controller.js) becomes a
// real kill switch: capture off first, no opacity trick. Plan §9: panic hotkey, tray "Stop now", stop button,
// before-quit, render-process-gone, uncaughtExceptionMonitor and renderer heartbeat loss all land in `trigger`.
import type { StopReason } from './types'

export const HEARTBEAT_TIMEOUT_MS = 5000

export type PanicDeps = {
  /** Stops capture tracks and closes STT sockets (session owner). Runs first. */
  stopCapture(): Promise<void> | void
  abortRequests(): void
  hideOverlay(): void
  /** Dock icon / content protection (privacy-mode `restoreAll`). */
  restorePrivacy(): void
  setTrayState(state: 'stopped'): void
  notify(reason: StopReason): void
  isLive(): boolean
  app: { on(event: 'before-quit', cb: () => void): unknown }
  /** The monitor event only observes: Electron's own crash handling still runs, the stop just happens first. */
  proc: { on(event: 'uncaughtExceptionMonitor', cb: () => void): unknown }
  /** Step failures are reported here; never thrown. */
  log?(step: string, err: unknown): void
}

export function createPanicController(deps: PanicDeps) {
  let running: Promise<void> | null = null
  let lastBeat = Date.now()
  let timer: ReturnType<typeof setInterval> | null = null

  async function step(name: string, fn: () => Promise<void> | void): Promise<void> {
    try { await fn() } catch (err) { deps.log?.(name, err) }
  }

  /** Idempotent: concurrent and repeated calls share one run until `reset()` (a new session starting). */
  function trigger(reason: StopReason): Promise<void> {
    running ??= (async () => {
      await step('capture', deps.stopCapture)
      await step('abort', deps.abortRequests)
      await step('hide', deps.hideOverlay)
      await step('privacy', deps.restorePrivacy)
      await step('tray', () => deps.setTrayState('stopped'))
      await step('notify', () => deps.notify(reason))
    })()
    return running
  }

  function arm(): void {
    deps.app.on('before-quit', () => { void trigger('user') })
    deps.proc.on('uncaughtExceptionMonitor', () => { void trigger('error') })
    lastBeat = Date.now()
    timer ??= setInterval(() => {
      if (deps.isLive() && Date.now() - lastBeat > HEARTBEAT_TIMEOUT_MS) void trigger('error')
    }, 1000)
    timer.unref?.()
  }

  return {
    trigger,
    arm,
    /** The overlay renderer pings this once a second while it is alive. */
    heartbeat(): void { lastBeat = Date.now() },
    /** A new session is starting: the next panic runs again. */
    reset(): void { running = null; lastBeat = Date.now() },
    dispose(): void { if (timer) clearInterval(timer); timer = null },
  }
}
