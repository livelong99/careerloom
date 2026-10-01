// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import type { TtsAudioMsg } from '../../../electron/kb/types'
import { createPlaybackQueue, type AudioCtxLike } from './queue'

const pcm = (ms: number) => new Int16Array(24 * ms).fill(1000).buffer as ArrayBuffer
const msg = (seq: number, ms: number, last = false, id = 'u'): TtsAudioMsg => ({ utteranceId: id, seq, pcm16: pcm(ms), sampleRate: 24000, last })

/** Minimal AudioContext with a manual clock; every source records start/stop. */
function fakeCtx() {
  const ctx = {
    currentTime: 10,
    sources: [] as Array<{ start: number; stop: number | null; dur: number; ended: () => void; fade: Array<[number, number]> }>,
    createBuffer: (_c: number, n: number, sr: number) => ({ duration: n / sr, getChannelData: () => new Float32Array(n) }),
    createGain: () => ({ gain: { value: 1, setValueAtTime: () => {}, linearRampToValueAtTime: () => {}, cancelScheduledValues: () => {} }, connect: () => {} }),
    createBufferSource: () => {
      const rec = { start: -1, stop: null as number | null, dur: 0, ended: () => {}, fade: [] as Array<[number, number]> }
      ctx.sources.push(rec)
      const s = { buffer: null as null | { duration: number }, onended: null as null | (() => void), connect: () => {}, start: (t: number) => { rec.start = t; rec.dur = s.buffer!.duration }, stop: (t: number) => { rec.stop = t } }
      rec.ended = () => s.onended?.()
      return s
    },
    destination: {},
  }
  return ctx as unknown as AudioCtxLike & typeof ctx
}

describe('playback queue', () => {
  it('schedules chunks gapless: each starts exactly when the previous ends', () => {
    const ctx = fakeCtx(); const q = createPlaybackQueue({ ctx: () => ctx, onPlayback: () => {} }); q.arm()
    q.push(msg(0, 500)); q.push(msg(1, 300)); q.push(msg(2, 200))
    const [a, b, c] = ctx.sources
    expect(a.start).toBeGreaterThanOrEqual(10)
    expect(b.start).toBeCloseTo(a.start + 0.5, 6); expect(c.start).toBeCloseTo(b.start + 0.3, 6)
  })
  it('a late chunk (underrun) starts at "now", never in the past', () => {
    const ctx = fakeCtx(); const q = createPlaybackQueue({ ctx: () => ctx, onPlayback: () => {} }); q.arm()
    q.push(msg(0, 100)); ctx.currentTime = 12; q.push(msg(1, 100))
    expect(ctx.sources[1].start).toBeGreaterThanOrEqual(12)
  })
  it('emits started once at the first chunk and ended when the last scheduled source finishes', () => {
    const ctx = fakeCtx(); const ev: string[] = []
    const q = createPlaybackQueue({ ctx: () => ctx, onPlayback: e => ev.push(`${e.phase}:${e.utteranceId}`) }); q.arm()
    q.push(msg(0, 100)); q.push(msg(1, 100))
    expect(ev).toEqual(['started:u'])
    q.push({ ...msg(2, 0, true), pcm16: new ArrayBuffer(0) }) // end marker
    expect(ev).toEqual(['started:u'])
    ctx.sources[0].ended(); expect(ev).toEqual(['started:u'])
    ctx.sources[1].ended(); expect(ev).toEqual(['started:u', 'ended:u'])
  })
  it('ends right away when the end marker arrives after everything already played', () => {
    const ctx = fakeCtx(); const ev: string[] = []
    const q = createPlaybackQueue({ ctx: () => ctx, onPlayback: e => ev.push(e.phase) }); q.arm()
    q.push(msg(0, 100)); ctx.sources[0].ended()
    q.push({ ...msg(1, 0, true), pcm16: new ArrayBuffer(0) })
    expect(ev).toEqual(['started', 'ended'])
  })
  it('cancel marker (seq -1) stops every source within the 30 ms fade and reports cancelled once', () => {
    const ctx = fakeCtx(); const ev: string[] = []
    const q = createPlaybackQueue({ ctx: () => ctx, onPlayback: e => ev.push(e.phase), fadeMs: 30 }); q.arm()
    q.push(msg(0, 500)); q.push(msg(1, 500))
    q.push({ ...msg(-1, 0, true), pcm16: new ArrayBuffer(0) })
    expect(ev).toEqual(['started', 'cancelled'])
    ctx.sources.forEach(s => expect(s.stop).toBeLessThanOrEqual(10.03 + 1e-9))
    ctx.sources[0].ended(); ctx.sources[1].ended() // late onended after cancel must not emit 'ended'
    expect(ev).toEqual(['started', 'cancelled'])
    q.push(msg(5, 100, false, 'v')) // next utterance plays normally and starts from "now"
    expect(ev.at(-1)).toBe('started'); expect(ctx.sources[2].start).toBeGreaterThanOrEqual(10)
  })
  it('cancel() with nothing playing does not emit', () => {
    const ctx = fakeCtx(); const on = vi.fn(); const q = createPlaybackQueue({ ctx: () => ctx, onPlayback: on }); q.arm(); q.cancel()
    expect(on).not.toHaveBeenCalled()
  })
  it('never plays (and never creates an AudioContext) before an explicit arm()', () => {
    const make = vi.fn(() => fakeCtx()); const on = vi.fn()
    const q = createPlaybackQueue({ ctx: make, onPlayback: on })
    q.push(msg(0, 100)); expect(make).not.toHaveBeenCalled(); expect(on).not.toHaveBeenCalled()
    q.arm(); q.push(msg(0, 100)); expect(make).toHaveBeenCalledTimes(1); expect(on).toHaveBeenCalledTimes(1)
    q.disarm(); q.push(msg(1, 100)); expect(on).toHaveBeenCalledTimes(2) // disarm cancels the running utterance, then drops new audio
    expect(on).toHaveBeenLastCalledWith({ phase: 'cancelled', utteranceId: 'u' })
  })
  it('drops malformed messages (odd byte length)', () => {
    const ctx = fakeCtx(); const q = createPlaybackQueue({ ctx: () => ctx, onPlayback: () => {} }); q.arm()
    q.push({ ...msg(0, 1), pcm16: new ArrayBuffer(3) }); expect(ctx.sources.length).toBe(0)
  })
})
