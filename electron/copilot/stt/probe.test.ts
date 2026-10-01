import { describe, expect, it, vi } from 'vitest'

import { createProbeHub } from './probe'
import { tone } from './pcm-gen.test-util'

const msg = (source: 'mic' | 'system', pcm: Int16Array) => ({ source, pcm16: pcm.slice().buffer, t: 0 })

describe('audio probe', () => {
  it('ok with the peak level when sound arrives during the window; other sources are ignored', async () => {
    vi.useFakeTimers()
    const hub = createProbeHub()
    const p = hub.probe('mic', 3000)
    hub.tap(msg('mic', tone(100, 16384))); hub.tap(msg('system', tone(100, 32000)))
    await vi.advanceTimersByTimeAsync(3000)
    expect(await p).toMatchObject({ source: 'mic', status: 'ok' })
    expect((await p).level).toBeCloseTo(0.5, 1)
    vi.useRealTimers()
  })
  it('silent when frames arrive but are digital zeros; missing when nothing arrives at all', async () => {
    vi.useFakeTimers()
    const hub = createProbeHub()
    const a = hub.probe('mic', 1000); hub.tap(msg('mic', new Int16Array(1600)))
    const b = hub.probe('system', 1000)
    await vi.advanceTimersByTimeAsync(1000)
    expect(await a).toEqual({ source: 'mic', status: 'silent', level: 0 })
    expect(await b).toEqual({ source: 'system', status: 'missing', level: 0 })
    vi.useRealTimers()
  })
  it('detaches after the window so late frames are not collected', async () => {
    vi.useFakeTimers()
    const hub = createProbeHub()
    const p = hub.probe('mic', 500)
    await vi.advanceTimersByTimeAsync(500); await p
    expect(() => hub.tap(msg('mic', tone(100)))).not.toThrow()
    expect(hub.active()).toBe(0)
    vi.useRealTimers()
  })
})
