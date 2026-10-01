// Replays a fixture of timed events against the audio clock (bytes pushed / 32 per ms), so tests and
// the latency harness run the same code path as a real engine without a model.
import { createEmitter, type SttAdapter, type SttEventName } from './adapter'

export type FakeEvent = { atMs: number; ev: Exclude<SttEventName, 'closed'>; text: string; t0: number; t1: number }
const EVENTS = new Set(['partial', 'final', 'endOfTurn', 'error'])

export function parseFixture(jsonl: string): FakeEvent[] {
  return jsonl.split('\n').map((l, i) => [l.trim(), i + 1] as const).filter(([l]) => l).map(([l, n]) => {
    let e: Partial<FakeEvent>
    try { e = JSON.parse(l) } catch { throw new Error(`fixture line ${n}: not JSON`) }
    if (typeof e.atMs !== 'number' || !EVENTS.has(e.ev ?? '') || typeof e.text !== 'string') throw new Error(`fixture line ${n}: needs atMs, ev, text`)
    return { atMs: e.atMs, ev: e.ev!, text: e.text, t0: e.t0 ?? 0, t1: e.t1 ?? e.atMs }
  })
}

export function createFakeAdapter(events: FakeEvent[]): SttAdapter {
  const { on, emit } = createEmitter()
  let clockMs = 0, next = 0, live = false
  return {
    id: 'fake',
    on,
    async start() { clockMs = 0; next = 0; live = true },
    push(pcm16) {
      if (!live) return
      clockMs += pcm16.byteLength / 32
      while (next < events.length && events[next]!.atMs <= clockMs) {
        const { ev, text, t0, t1 } = events[next++]!
        emit(ev, { text, t0, t1 })
      }
    },
    async stop() { if (live) { live = false; emit('closed', { text: '', t0: 0, t1: 0 }) } },
  }
}
