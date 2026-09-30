import { afterEach, describe, expect, it, vi } from 'vitest'

import { createPanicController, type PanicDeps } from './panic'

function setup(over: Partial<PanicDeps> = {}) {
  const calls: string[] = []
  const handlers = new Map<string, () => void>()
  const deps: PanicDeps = {
    stopCapture: vi.fn(async () => { calls.push('capture') }),
    abortRequests: vi.fn(() => { calls.push('abort') }),
    hideOverlay: vi.fn(() => { calls.push('hide') }),
    restorePrivacy: vi.fn(() => { calls.push('privacy') }),
    setTrayState: vi.fn(() => { calls.push('tray') }),
    notify: vi.fn(() => { calls.push('notify') }),
    isLive: () => true,
    app: { on: (e: string, cb: () => void) => { handlers.set(e, cb) } },
    proc: { on: (e: string, cb: () => void) => { handlers.set(e, cb) } },
    ...over,
  }
  return { deps, calls, handlers, panic: createPanicController(deps) }
}

afterEach(() => { vi.useRealTimers() })

describe('panic / kill switch', () => {
  it('turns capture off first, then aborts requests, hides, restores, updates tray, notifies', async () => {
    const { panic, calls } = setup()
    await panic.trigger('panic')
    expect(calls).toEqual(['capture', 'abort', 'hide', 'privacy', 'tray', 'notify'])
  })

  it('stops a fake session in under 200 ms', async () => {
    const { panic } = setup()
    const t0 = performance.now()
    await panic.trigger('panic')
    expect(performance.now() - t0).toBeLessThan(200)
  })

  it('is idempotent: a second trigger does nothing until a new session re-enables it', async () => {
    const { panic, deps } = setup()
    await Promise.all([panic.trigger('panic'), panic.trigger('user')])
    await panic.trigger('error')
    expect(deps.stopCapture).toHaveBeenCalledTimes(1)
    panic.reset()
    await panic.trigger('panic')
    expect(deps.stopCapture).toHaveBeenCalledTimes(2)
  })

  it('a failing step never blocks the remaining steps', async () => {
    const { panic, calls } = setup({ stopCapture: vi.fn(async () => { throw new Error('track already ended') }) })
    await panic.trigger('panic')
    expect(calls).toEqual(['abort', 'hide', 'privacy', 'tray', 'notify'])
  })

  it('passes the reason to the renderers', async () => {
    const { panic, deps } = setup()
    await panic.trigger('error')
    expect(deps.notify).toHaveBeenCalledWith('error')
  })

  it('arm(): before-quit and uncaughtExceptionMonitor (observe only, Electron keeps its crash handling) trigger it', async () => {
    const { panic, handlers, deps } = setup()
    panic.arm()
    handlers.get('before-quit')?.()
    await vi.waitFor(() => expect(deps.stopCapture).toHaveBeenCalledTimes(1))
    panic.reset()
    handlers.get('uncaughtExceptionMonitor')?.()
    expect(handlers.has('uncaughtException')).toBe(false)
    await vi.waitFor(() => expect(deps.stopCapture).toHaveBeenCalledTimes(2))
    panic.dispose()
  })

  it('arm(): losing the renderer heartbeat for 5 s while live triggers panic(error)', async () => {
    vi.useFakeTimers()
    const { panic, deps } = setup()
    panic.arm()
    panic.heartbeat()
    await vi.advanceTimersByTimeAsync(4000)
    expect(deps.stopCapture).not.toHaveBeenCalled()
    panic.heartbeat()
    await vi.advanceTimersByTimeAsync(4000)
    expect(deps.stopCapture).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(2000)
    expect(deps.stopCapture).toHaveBeenCalledTimes(1)
    expect(deps.notify).toHaveBeenCalledWith('error')
    panic.dispose()
  })

  it('heartbeat loss is ignored when no session is live', async () => {
    vi.useFakeTimers()
    const { panic, deps } = setup({ isLive: () => false })
    panic.arm()
    await vi.advanceTimersByTimeAsync(20_000)
    expect(deps.stopCapture).not.toHaveBeenCalled()
    panic.dispose()
  })
})
