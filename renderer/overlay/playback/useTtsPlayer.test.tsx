// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { useTtsPlayer } from './useTtsPlayer'

let push: (m: unknown) => void = () => undefined
const bridge = { onTtsAudio: vi.fn((cb: (m: unknown) => void) => { push = cb; return () => undefined }), kbTtsPlayback: vi.fn() }
const contexts = vi.fn()
class FakeCtx {
  currentTime = 0; destination = {}
  constructor() { contexts() }
  createGain() { return { gain: { cancelScheduledValues() {}, setValueAtTime() {}, linearRampToValueAtTime() {}, value: 1 }, connect() {} } }
  createBuffer(_c: number, n: number) { return { duration: n / 24000, getChannelData: () => new Float32Array(n) } }
  createBufferSource() { return { buffer: null, onended: null, connect() {}, start() {}, stop() {} } }
}
beforeEach(() => { (window as unknown as { careerloom: unknown }).careerloom = bridge; vi.stubGlobal('AudioContext', FakeCtx) })
afterEach(() => { cleanup(); vi.clearAllMocks(); vi.unstubAllGlobals() })
const pcm = (last: boolean) => ({ utteranceId: 'u1', seq: 0, pcm16: new Int16Array(240).buffer, sampleRate: 24000, last })
function Probe({ armed }: { armed: boolean }) { useTtsPlayer(armed); return null }

describe('useTtsPlayer', () => {
  it('stays silent (no AudioContext) until an interview arms it', () => {
    const { rerender } = render(<Probe armed={false} />)
    push(pcm(false))
    expect(contexts).not.toHaveBeenCalled()
    rerender(<Probe armed />)
    push(pcm(false))
    expect(contexts).toHaveBeenCalledTimes(1)
    expect(bridge.kbTtsPlayback).toHaveBeenCalledWith({ phase: 'started', utteranceId: 'u1' })
  })
  it('disarming cancels what is playing and reports it to main', () => {
    const { rerender } = render(<Probe armed />)
    push(pcm(false))
    rerender(<Probe armed={false} />)
    expect(bridge.kbTtsPlayback).toHaveBeenCalledWith({ phase: 'cancelled', utteranceId: 'u1' })
  })
  it('does nothing without a bridge', () => {
    ;(window as unknown as { careerloom: unknown }).careerloom = undefined
    expect(() => render(<Probe armed />)).not.toThrow()
  })
})
