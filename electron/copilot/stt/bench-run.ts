// "Benchmark on this computer" (plan §3.2): the fixture audio goes through the same adapter a session uses, twice:
// an unpaced pass for real-time factor and WER, and a real-time-paced pass for latency (end of speech → final, so it
// includes the endpoint wait, like S2). Model load happens in start(), outside both timings. RAM is not sampled:
// MLX weights live in GPU memory and RSS under-reports them (S2), so ramMb stays null rather than misleading.
import type { SttBenchmark } from '../types'
import type { SttAdapter } from './adapter'
import { percentile, werOf } from './bench'
import type { BenchFixture } from './bench-fixture'

export type BenchClock = { now(): number; sleepUntil(ms: number): Promise<void> }
const FRAME_MS = 100
const DRAIN_MS = 3000 // after the last frame, how long a final may still arrive

export function realClock(): BenchClock {
  const t0 = performance.now()
  return { now: () => performance.now() - t0, sleepUntil: ms => new Promise(r => setTimeout(r, Math.max(0, ms - (performance.now() - t0)))) }
}

const frameList = (pcm: Int16Array): ArrayBuffer[] => {
  const n = 16 * FRAME_MS, out: ArrayBuffer[] = []
  for (let o = 0; o + n <= pcm.length; o += n) out.push(pcm.slice(o, o + n).buffer)
  return out
}
const tick = () => new Promise<void>(r => setImmediate(r))

export async function runBenchmark(o: { make: () => SttAdapter; fixture: BenchFixture; endSilenceMs: number; clock?: BenchClock }): Promise<SttBenchmark> {
  const { fixture, make } = o, clock = o.clock ?? realClock()
  const opts = { source: 'mic' as const, language: 'en', vocab: [], endSilenceMs: o.endSilenceMs }
  const frames = frameList(fixture.pcm), audioMs = frames.length * FRAME_MS

  async function pass(paced: boolean) {
    const a = make(), finals: Array<{ text: string; at: number }> = []
    a.on('final', e => finals.push({ text: e.text, at: clock.now() - t0 }))
    await a.start(opts)
    const t0 = clock.now()
    for (const [i, f] of frames.entries()) {
      if (paced) await clock.sleepUntil(t0 + i * FRAME_MS)
      else if (i % 10 === 0) await tick()
      a.push(f)
    }
    if (paced) for (let w = 0; w < DRAIN_MS && finals.length < fixture.utterances.length; w += FRAME_MS) await clock.sleepUntil(t0 + audioMs + w)
    await a.stop()
    return { finals, wallMs: clock.now() - t0 }
  }

  const fast = await pass(false)
  const live = await pass(true)
  if (!fast.finals.length && !live.finals.length) throw new Error('The speech model returned no text — check the install and try again')

  const latencies: number[] = []
  let next = 0
  for (const u of fixture.utterances) {
    while (next < live.finals.length && live.finals[next]!.at < u.endMs - FRAME_MS) next++ // finals that cannot belong to this utterance
    const f = live.finals[next]
    if (f) { latencies.push(f.at - u.endMs); next++ }
  }
  return {
    at: Date.now(), p50FinalMs: Math.round(percentile(latencies, 0.5)), realTimeFactor: Math.round((fast.wallMs / audioMs) * 100) / 100,
    ramMb: null, wer: Math.round(werOf(fixture.refText, fast.finals.map(f => f.text).join(' ')) * 1000) / 1000,
  }
}
