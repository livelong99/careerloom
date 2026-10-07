import { describe, expect, it, vi } from 'vitest'

import { createSessionController } from './session'
import { CONT_EXTRA_MS } from './stt/endpoint'
import { createFakeAdapter, parseFixture } from './stt/fake'
import type { CopilotEvents, StartRequest } from './types'

const FIXTURE = [
  { atMs: 300, ev: 'partial', text: 'tell me', t0: 0, t1: 300 },
  { atMs: 900, ev: 'final', text: 'Tell me about yourself.', t0: 0, t1: 900 },
  { atMs: 1500, ev: 'final', text: 'And why us?', t0: 1200, t1: 1500 },
].map(e => JSON.stringify(e)).join('\n')
const REQ: StartRequest = { mode: 'practice', jobId: 'j1', interviewType: 'mixed', consent: null }
const chunk = (ms: number, v = 0) => new Int16Array(16 * ms).fill(v).buffer

function setup(createAdapter = () => createFakeAdapter(parseFixture(FIXTURE))) {
  const events: Array<[string, unknown]> = []
  const emit = <K extends keyof CopilotEvents>(ev: K, p: CopilotEvents[K]) => void events.push([ev, p])
  let t = 0
  const s = createSessionController({
    createAdapter, emit, now: () => t, newId: () => 'S1',
    stt: () => ({ engine: 'moonshine', model: null, device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs: 700, vocab: [] }),
  })
  return { s, events, advance: (ms: number) => { t += ms }, of: (name: string) => events.filter(e => e[0] === name).map(e => e[1]) }
}

describe('session controller (mic-only, fake STT)', () => {
  it('walks idle → armed → listening → stopped and replays transcript parity through audio chunks', async () => {
    const { s, of, advance } = setup()
    expect(s.state()).toBe('idle')
    expect(await s.start(REQ)).toEqual({ sessionId: 'S1' })
    expect(s.state()).toBe('listening')
    for (let i = 0; i < 20; i++) { advance(100); s.audio({ source: 'mic', pcm16: chunk(100, 500), t: i * 100 }) }
    const lines = of('copilotTranscript') as Array<{ id: string; speaker: string; text: string; final: boolean; t1: number | null }>
    expect(lines.map(l => [l.speaker, l.text, l.final])).toEqual([['you', 'tell me', false], ['you', 'Tell me about yourself.', true], ['you', 'And why us?', true]])
    expect(lines[0]!.id).toBe(lines[1]!.id)            // partial and its final share an id
    expect(lines[2]!.id).not.toBe(lines[1]!.id)
    expect(of('copilotState').map(e => (e as { state: string }).state)).toEqual(['armed', 'listening'])
    await s.stop('user')
    expect(s.state()).toBe('stopped')
    s.audio({ source: 'mic', pcm16: chunk(100), t: 0 })  // ignored after stop
    expect(of('copilotTranscript')).toHaveLength(3)
  })

  it('throttles levels to ≤15/s and reports a dead source as silent', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0)
    const events: Array<[string, unknown]> = []
    const s = createSessionController({
      createAdapter: () => createFakeAdapter([]), now: Date.now, newId: () => 'S',
      emit: (ev, p) => void events.push([ev, p]),
      stt: () => ({ engine: 'moonshine', model: null, device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs: 700, vocab: [] }),
    })
    await s.start(REQ)
    for (let i = 0; i < 40; i++) { vi.advanceTimersByTime(10); s.audio({ source: 'mic', pcm16: chunk(10, 100), t: i }) } // 400 ms of audio
    expect(events.filter(e => e[0] === 'copilotLevel').length).toBeLessThanOrEqual(7)
    vi.advanceTimersByTime(3000) // the track goes dead
    expect(events.filter(e => e[0] === 'copilotHealth').map(e => (e[1] as { status: string }).status)).toEqual(['silent'])
    await s.stop('user'); vi.useRealTimers()
  })

  it('a mic that never delivers a frame is reported as missing, with a capture error that names the likely causes', async () => {
    vi.useFakeTimers(); vi.setSystemTime(0)
    const events: Array<[string, unknown]> = []
    const s = createSessionController({
      createAdapter: () => createFakeAdapter([]), now: Date.now, newId: () => 'S',
      emit: (ev, p) => void events.push([ev, p]),
      stt: () => ({ engine: 'moonshine', model: null, device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs: 700, vocab: [] }),
    })
    await s.start(REQ)
    vi.advanceTimersByTime(3000)
    expect(events.filter(e => e[0] === 'copilotHealth').map(e => (e[1] as { status: string }).status)).toEqual(['missing'])
    expect(events.filter(e => e[0] === 'copilotError').map(e => e[1])).toEqual([{ kind: 'capture', message: expect.stringMatching(/no audio.*microphone/i), retrying: false }])
    await s.stop('user'); vi.useRealTimers()
  })

  it('a failing adapter start tears down, reports a stt error and stops', async () => {
    const bad = () => ({ ...createFakeAdapter([]), start: async () => { throw new Error('Local speech model is not installed') } })
    const { s, of } = setup(bad)
    await expect(s.start(REQ)).rejects.toThrow(/not installed/)
    expect(s.state()).toBe('stopped')
    expect(of('copilotError')).toEqual([{ kind: 'stt', message: 'Local speech model is not installed', retrying: false }])
  })

  it('refuses a second start while running, allows restart after stop', async () => {
    const { s } = setup()
    await s.start(REQ)
    await expect(s.start(REQ)).rejects.toThrow(/already running/)
    await s.stop('panic'); await expect(s.start(REQ)).resolves.toBeTruthy()
  })

  it('reports each adapter end-of-turn with its speaker', async () => {
    const eot: string[] = []
    const events: Array<[string, unknown]> = []
    const fx = [{ atMs: 100, ev: 'final', text: 'Hi.', t0: 0, t1: 100 }, { atMs: 200, ev: 'endOfTurn', text: '', t0: 100, t1: 200 }].map(e => JSON.stringify(e)).join('\n')
    const s = createSessionController({
      createAdapter: () => createFakeAdapter(parseFixture(fx)), now: () => 0, newId: () => 'S', endOfTurn: sp => void eot.push(sp),
      emit: (ev, p) => void events.push([ev, p]),
      stt: () => ({ engine: 'moonshine', model: null, device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs: 700, vocab: [] }),
    })
    await s.start(REQ)
    for (let i = 0; i < 3; i++) s.audio({ source: 'mic', pcm16: chunk(100, 500), t: i })
    expect(eot).toEqual(['you'])
    await s.stop('user')
  })

  it('retry swaps in fresh adapters for the running session and keeps listening', async () => {
    let made = 0
    const { s, of } = setup(() => { made++; return createFakeAdapter(parseFixture(FIXTURE)) })
    await s.start(REQ)
    await s.retry()
    expect(made).toBe(2)
    expect(s.state()).toBe('listening')
    s.audio({ source: 'mic', pcm16: chunk(1000, 500), t: 0 })
    expect((of('copilotTranscript') as unknown[]).length).toBeGreaterThan(0)
    await s.stop('user'); await s.retry() // a stopped session is not revived
    expect(made).toBe(2)
  })

  it('stamps transcript lines in epoch ms (session start + audio clock), so they compare with question times', async () => {
    const events: Array<[string, unknown]> = []
    const s = createSessionController({
      createAdapter: () => createFakeAdapter(parseFixture(FIXTURE)), now: () => 1_700_000_000_000, newId: () => 'S',
      emit: (ev, p) => void events.push([ev, p]),
      stt: () => ({ engine: 'moonshine', model: null, device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs: 700, vocab: [] }),
    })
    await s.start(REQ)
    for (let i = 0; i < 10; i++) s.audio({ source: 'mic', pcm16: chunk(100, 500), t: i })
    const finals = events.filter(e => e[0] === 'copilotTranscript').map(e => e[1] as { t0: number; t1: number | null; final: boolean }).filter(l => l.final)
    expect(finals[0]).toMatchObject({ t0: 1_700_000_000_000, t1: 1_700_000_000_900 })
    await s.stop('user')
  })
})

describe('stop while arming (kill switch)', () => {
  it('a stop during a slow adapter start stays stopped and never reaches listening', async () => {
    let release: () => void = () => undefined
    const slow = () => { const a = createFakeAdapter([]); const start = a.start.bind(a); return { ...a, on: a.on, start: async (o: Parameters<typeof start>[0]) => { await new Promise<void>(r => { release = r }); await start(o) } } }
    const { s, of } = setup(slow)
    const starting = s.start(REQ)
    await Promise.resolve()
    expect(s.state()).toBe('armed')
    await s.stop('panic')
    expect(s.state()).toBe('stopped')
    release()
    await expect(starting).rejects.toThrow(/stopped/i)
    expect(s.state()).toBe('stopped')
    expect(of('copilotState').map(e => (e as { state: string }).state)).toEqual(['armed', 'stopped'])
  })
})

describe('session controller: endpointing + duplicate finals (PERF-2)', () => {
  const emitterFor = (events: Array<{ atMs: number; ev: 'final' | 'partial'; text: string; t0?: number; t1?: number }>) => () => createFakeAdapter(parseFixture(events.map(e => JSON.stringify(e)).join('\n')))
  const run = async (adapter: () => ReturnType<typeof createFakeAdapter>, req: StartRequest, sources?: Array<'mic' | 'system'>) => {
    const events: Array<[string, unknown]> = []
    const opened: unknown[] = []
    const s = createSessionController({
      createAdapter: () => { const a = adapter(); const start = a.start.bind(a); a.start = o => { opened.push(o); return start(o) }; return a },
      emit: (ev, p) => void events.push([ev, p]), now: () => 0, newId: () => 'S1', sources: sources ? () => sources : undefined,
      stt: () => ({ engine: 'moonshine', model: null, device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs: 650, vocab: [] }),
    })
    await s.start(req)
    for (let i = 0; i < 20; i++) s.audio({ source: sources?.[0] ?? 'mic', pcm16: chunk(100, 500), t: i * 100 })
    return { events, opened: opened as Array<{ fastEndpoint?: boolean; endSilenceMs: number }>, finals: events.filter(e => e[0] === 'copilotTranscript' && (e[1] as { final: boolean }).final).map(e => (e[1] as { text: string }).text) }
  }

  it('asks for the fast endpoint on the interviewer channel and in live mode, never for practice answers', async () => {
    const dup = emitterFor([])
    expect((await run(dup, { ...REQ, mode: 'practice' })).opened[0]!.fastEndpoint).toBe(false)
    expect((await run(dup, { ...REQ, mode: 'live' })).opened[0]!.fastEndpoint).toBe(true)
    expect((await run(dup, { ...REQ, mode: 'practice' }, ['system'])).opened[0]!.fastEndpoint).toBe(true)
  })

  it('practice answers wait out a thinking pause (a pause mid-answer must not end the turn); the fast channels keep the configured wait', async () => {
    const dup = emitterFor([])
    expect((await run(dup, { ...REQ, mode: 'practice' })).opened[0]).toMatchObject({ endSilenceMs: 650 + CONT_EXTRA_MS })
    expect((await run(dup, { ...REQ, mode: 'live' })).opened[0]).toMatchObject({ endSilenceMs: 650 })
  })

  it('drops a final that repeats the previous one (formatted/unformatted or re-decoded) but keeps real repeats later', async () => {
    const adapter = emitterFor([
      { atMs: 300, ev: 'final', text: 'Tell me about yourself.', t0: 0, t1: 900 },
      { atMs: 400, ev: 'final', text: 'tell me about yourself', t0: 0, t1: 900 },
      { atMs: 500, ev: 'final', text: 'Tell me about yourself', t0: 100, t1: 950 },
      { atMs: 600, ev: 'final', text: 'And why us?', t0: 1200, t1: 1500 },
      { atMs: 1700, ev: 'final', text: 'And why us?', t0: 9000, t1: 9500 },
    ])
    expect((await run(adapter, { ...REQ, mode: 'live' })).finals).toEqual(['Tell me about yourself.', 'And why us?', 'And why us?'])
  })
})

