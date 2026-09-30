import { describe, expect, it, vi } from 'vitest'

import { createFakeAdapter, parseFixture } from './fake'
import { createMerger, mergeText } from './merge'
import { PcmRing } from './ring'
import { percentile, summarise } from './bench'
import { decodeFrames, encodeFrame, FRAME } from './framing'
import type { SttEvent } from './adapter'

const pcm = (ms: number) => new Int16Array((16 * ms) | 0).buffer // 16 kHz mono PCM16, silence

describe('PcmRing', () => {
  it('keeps only the last maxMs of audio, oldest first', () => {
    const ring = new PcmRing(100)
    for (let i = 0; i < 5; i++) ring.push(new Int16Array(800).fill(i + 1).buffer) // 5 x 50 ms
    const got = ring.snapshot().map(b => new Int16Array(b)[0])
    expect(got).toEqual([4, 5])
    expect(ring.snapshot().reduce((n, b) => n + b.byteLength, 0)).toBe(100 * 32)
  })
  it('clear empties it', () => {
    const ring = new PcmRing(100); ring.push(pcm(50)); ring.clear()
    expect(ring.snapshot()).toEqual([])
  })
})

describe('mergeText', () => {
  it('drops contained and overlapping text', () => {
    expect(mergeText('tell me about', 'Tell me about yourself')).toBe('Tell me about yourself')
    expect(mergeText('tell me about yourself', 'yourself and why us')).toBe('tell me about yourself and why us')
    expect(mergeText('', 'hi')).toBe('hi')
    expect(mergeText('hello there', 'hello there')).toBe('hello there')
  })
})

describe('createMerger', () => {
  it('flushes merged finals per source after the quiet window', () => {
    vi.useFakeTimers()
    const out: Array<[string, string]> = []
    const m = createMerger(2400, (source, text) => out.push([source, text]))
    m.add('mic', 'so I built')
    vi.advanceTimersByTime(1000)
    m.add('mic', 'a cache layer')
    m.add('system', 'why?')
    vi.advanceTimersByTime(2399)
    expect(out).toEqual([])
    vi.advanceTimersByTime(1)
    expect(out).toContainEqual(['system', 'why?'])
    vi.advanceTimersByTime(1000)
    expect(out).toContainEqual(['mic', 'so I built a cache layer'])
    vi.useRealTimers()
  })
})

describe('framing', () => {
  it('round-trips frames split at arbitrary byte boundaries', () => {
    const all = Buffer.concat([encodeFrame(FRAME.pcm, new Uint8Array([1, 2, 3, 4])), encodeFrame(FRAME.config, Buffer.from('{"x":1}'))])
    for (let cut = 0; cut <= all.length; cut++) {
      const first = decodeFrames(all.subarray(0, cut))
      const second = decodeFrames(Buffer.concat([first.rest, all.subarray(cut)]))
      const frames = [...first.frames, ...second.frames]
      expect(frames.map(f => [f.type, f.payload.toString('hex')])).toEqual([[2, '01020304'], [1, Buffer.from('{"x":1}').toString('hex')]])
      expect(second.rest.length).toBe(0)
    }
  })
})

describe('fake adapter', () => {
  const fixture = [
    { atMs: 300, ev: 'partial', text: 'tell me', t0: 0, t1: 300 },
    { atMs: 900, ev: 'final', text: 'Tell me about yourself.', t0: 0, t1: 900 },
    { atMs: 900, ev: 'endOfTurn', text: '', t0: 900, t1: 900 },
  ].map(e => JSON.stringify(e)).join('\n')

  it('replays events in order as the audio clock passes their time (80 ms frames)', async () => {
    const a = createFakeAdapter(parseFixture(fixture))
    const seen: Array<[string, string]> = []
    for (const ev of ['partial', 'final', 'endOfTurn'] as const) a.on(ev, (e: SttEvent) => seen.push([ev, e.text]))
    await a.start({ source: 'mic', language: 'en', vocab: [], endSilenceMs: 700 })
    for (let t = 0; t < 1200; t += 80) a.push(pcm(80))
    expect(seen).toEqual([['partial', 'tell me'], ['final', 'Tell me about yourself.'], ['endOfTurn', '']])
  })

  it('emits closed on stop and ignores audio after', async () => {
    const a = createFakeAdapter(parseFixture(fixture))
    const closed = vi.fn(); a.on('closed', closed)
    await a.start({ source: 'mic', language: 'en', vocab: [], endSilenceMs: 700 })
    await a.stop(); a.push(pcm(2000))
    expect(closed).toHaveBeenCalledTimes(1)
  })

  it('rejects a malformed fixture line with its number', () => {
    expect(() => parseFixture('{"atMs":1,"ev":"final","text":"x","t0":0,"t1":1}\nnope')).toThrow(/line 2/)
  })
})

describe('bench stats', () => {
  it('percentile interpolates; summarise gives p50/p95 and RTF', () => {
    expect(percentile([100, 200, 300, 400], 0.5)).toBe(250)
    const s = summarise({ finalLatenciesMs: [100, 200, 300], audioMs: 10_000, wallMs: 2_000, ramMb: 512 })
    expect(s).toMatchObject({ p50FinalMs: 200, realTimeFactor: 0.2, ramMb: 512 })
    expect(s.p95FinalMs).toBeGreaterThan(280)
  })
  it('handles no finals', () => {
    expect(summarise({ finalLatenciesMs: [], audioMs: 1000, wallMs: 500, ramMb: null }).p50FinalMs).toBe(0)
  })
})
