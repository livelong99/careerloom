import { describe, expect, it } from 'vitest'

import { createFakeAdapter } from './fake'
import { werOf } from './bench'
import { runBenchmark, type BenchClock } from './bench-run'
import type { BenchFixture } from './bench-fixture'

const fixture: BenchFixture = {
  pcm: new Int16Array(16 * 5200), refText: 'one two three four',
  utterances: [{ text: 'one two', endMs: 1000 }, { text: 'three four', endMs: 3600 }],
}
/** Virtual time: sleepUntil jumps, now() just reads it. */
function clock(): BenchClock {
  let t = 0
  return { now: () => t, sleepUntil: async ms => { t = Math.max(t, ms); await Promise.resolve() } }
}
const fx = (events: Array<{ atMs: number; text: string }>) => events.map(e => ({ ...e, ev: 'final' as const, t0: 0, t1: e.atMs }))

describe('werOf', () => {
  it('counts substitutions, insertions and deletions over the reference; ignores case and punctuation', () => {
    expect(werOf('Tell me about it.', 'tell me about it')).toBe(0)
    expect(werOf('a b c d', 'a x c')).toBe(0.5)
    expect(werOf('a b', 'a b c d')).toBe(1)
    expect(werOf('', '')).toBe(0)
    expect(werOf('mutex lock', '')).toBe(1)
  })
})

describe('runBenchmark', () => {
  it('latency = arrival of the first final after each utterance end; WER from the same finals', async () => {
    const r = await runBenchmark({ make: () => createFakeAdapter(fx([{ atMs: 1600, text: 'one two' }, { atMs: 4200, text: 'three four' }])), fixture, endSilenceMs: 600, clock: clock() })
    expect(r.p50FinalMs).toBeGreaterThanOrEqual(600); expect(r.p50FinalMs).toBeLessThanOrEqual(700) // 100 ms frame granularity
    expect(r.wer).toBe(0)
    expect(r.realTimeFactor).toBeGreaterThanOrEqual(0)
    expect(r.at).toBeGreaterThan(0)
  })
  it('reports WER against the reference', async () => {
    const r = await runBenchmark({ make: () => createFakeAdapter(fx([{ atMs: 1600, text: 'one too' }, { atMs: 4200, text: 'three four' }])), fixture, endSilenceMs: 600, clock: clock() })
    expect(r.wer).toBe(0.25)
  })
  it('a missed utterance is left out of the latency, not counted as zero', async () => {
    const r = await runBenchmark({ make: () => createFakeAdapter(fx([{ atMs: 4200, text: 'one two three four' }])), fixture, endSilenceMs: 600, clock: clock() })
    expect(r.p50FinalMs).toBeGreaterThanOrEqual(600)
  })
  it('fails clearly when the engine returns no text', async () => {
    await expect(runBenchmark({ make: () => createFakeAdapter([]), fixture, endSilenceMs: 600, clock: clock() })).rejects.toThrow(/no text/i)
  })
})
