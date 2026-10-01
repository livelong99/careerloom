import { describe, expect, it } from 'vitest'

import type { SttEvent } from './adapter'
import { createChunkedAdapter, type Decoder } from './buffer'
import { concat, frames, silence, tone } from './pcm-gen.test-util'

const OPTS = { source: 'mic' as const, language: 'en', vocab: [], endSilenceMs: 600 }

function setup(decoder?: Partial<Decoder>) {
  const calls: Array<{ kind: string; ms: number }> = []
  const dec: Decoder = {
    ready: async () => {},
    decode: async (pcm, kind) => { calls.push({ kind, ms: pcm.length / 16 }); return kind === 'final' ? `final ${calls.length}` : `partial ${calls.length}` },
    close: async () => {},
    ...decoder,
  }
  const a = createChunkedAdapter({ id: 'fake', decoder: dec })
  const seen: Array<[string, SttEvent]> = []
  for (const ev of ['partial', 'final', 'endOfTurn', 'error', 'closed'] as const) a.on(ev, e => seen.push([ev, e]))
  return { a, calls, seen, names: () => seen.map(s => s[0]) }
}
// One macrotask per 100 ms frame so async decodes can settle between frames, like real capture.
const feed = async (a: ReturnType<typeof setup>['a'], pcm: Int16Array) => { for (const f of frames(pcm)) { a.push(f.slice().buffer); await new Promise(r => setImmediate(r)) } }
const settle = () => new Promise(r => setTimeout(r, 5))

describe('chunked adapter (non-streaming engine behind SttAdapter)', () => {
  it('emits a final then endOfTurn once silence reaches endSilenceMs, with audio-clock timestamps', async () => {
    const { a, seen, names } = setup()
    await a.start(OPTS)
    await feed(a, concat(silence(500), tone(1500), silence(1000)))
    await settle()
    expect(names()).toContain('final')
    expect(names().indexOf('final')).toBeLessThan(names().indexOf('endOfTurn'))
    const fin = seen.find(s => s[0] === 'final')![1]
    expect(fin.t0).toBeGreaterThanOrEqual(500); expect(fin.t0).toBeLessThan(700)
    expect(fin.t1).toBeGreaterThanOrEqual(2000 + 500) // speech end + endSilenceMs
    expect(fin.text).toMatch(/^final/)
    await a.stop()
  })

  it('does not finalise before the silence window passes', async () => {
    const { a, names } = setup()
    await a.start(OPTS)
    await feed(a, concat(silence(300), tone(1500), silence(400)))
    await settle()
    expect(names()).not.toContain('final')
    await a.stop()
  })

  it('emits growing-window partials about every second while speaking, before the final', async () => {
    const { a, calls, names } = setup()
    await a.start(OPTS)
    await feed(a, concat(silence(300), tone(3500), silence(800)))
    await settle()
    const partials = calls.filter(c => c.kind === 'partial')
    expect(partials.length).toBeGreaterThanOrEqual(2)
    expect(partials[1]!.ms).toBeGreaterThan(partials[0]!.ms) // window grows
    expect(names().indexOf('partial')).toBeLessThan(names().indexOf('final'))
    await a.stop()
  })

  it('skips a partial while a decode is still running so finals never queue behind them', async () => {
    let release: () => void = () => {}
    const slow = new Promise<void>(r => { release = r })
    const { a, calls } = setup({ decode: async (pcm, kind) => { calls2.push(kind); if (kind === 'partial') await slow; return 'x' } })
    const calls2: string[] = []
    await a.start(OPTS)
    await feed(a, concat(silence(300), tone(4500)))
    await settle()
    expect(calls2.filter(k => k === 'partial')).toHaveLength(1)
    release(); void calls
    await a.stop()
  })

  it('drops blips shorter than the minimum speech length and empty decodes', async () => {
    const { a, names } = setup({ decode: async () => '' })
    await a.start(OPTS)
    await feed(a, concat(silence(300), tone(1000), silence(1000)))
    await settle()
    expect(names()).not.toContain('final')
    const b = setup()
    await b.a.start(OPTS)
    await feed(b.a, concat(silence(300), tone(100), silence(1500)))
    await settle()
    expect(b.names()).not.toContain('final')
  })

  it('stop flushes an open utterance as a last final, then closed; later audio is ignored', async () => {
    const { a, names } = setup()
    await a.start(OPTS)
    await feed(a, concat(silence(300), tone(1500)))
    await a.stop()
    expect(names().slice(-3)).toEqual(['final', 'endOfTurn', 'closed'])
    await feed(a, tone(1500)); await settle()
    expect(names().filter(n => n === 'closed')).toHaveLength(1)
  })

  it('forces a final when one utterance runs past the window cap', async () => {
    const { a, calls } = setup()
    await a.start(OPTS)
    await feed(a, concat(silence(300), tone(27_000)))
    await settle()
    expect(calls.filter(c => c.kind === 'final').length).toBe(1)
    expect(calls.find(c => c.kind === 'final')!.ms).toBeLessThanOrEqual(25_100)
    await a.stop()
  })

  it('a decoder failure surfaces as error and closed (no hang)', async () => {
    const { a, names } = setup({ decode: async () => { throw new Error('boom') } })
    await a.start(OPTS)
    await feed(a, concat(silence(300), tone(1500), silence(900)))
    await settle()
    expect(names()).toContain('error')
    await a.stop()
    expect(names().at(-1)).toBe('closed')
  })
})

describe('adaptive endpoint (fastEndpoint)', () => {
  const FAST = { ...OPTS, endSilenceMs: 650, fastEndpoint: true }
  const finalAt = (seen: Array<[string, SttEvent]>) => seen.find(s => s[0] === 'final')![1]
  const SPEECH_END = 300 + 1500

  it('finalises a finished sentence right after the early window instead of the full wait', async () => {
    const { a, seen, calls } = setup({ decode: async (pcm, kind) => { calls2.push(kind); return 'Tell me about yourself.' } })
    const calls2: string[] = []
    await a.start(FAST)
    await feed(a, concat(silence(300), tone(1500), silence(1000)))
    await settle()
    expect(finalAt(seen).t1).toBeLessThan(SPEECH_END + 450) // early window (one 100 ms frame granularity), not 650
    expect(finalAt(seen).t1).toBeGreaterThanOrEqual(SPEECH_END + 200)
    expect(seen.filter(s => s[0] === 'final')).toHaveLength(1)
    expect(seen.filter(s => s[0] === 'endOfTurn')).toHaveLength(1)
    void calls
    await a.stop()
  })

  it('keeps the full wait for unfinished text and reuses the early decode (one final decode)', async () => {
    const finals: number[] = []
    const { a, seen } = setup({ decode: async (pcm, kind) => { if (kind === 'final') finals.push(pcm.length); return 'so tell me about' } })
    await a.start(FAST)
    await feed(a, concat(silence(300), tone(1500), silence(1000)))
    await settle()
    expect(finalAt(seen).t1).toBeGreaterThanOrEqual(SPEECH_END + 650)
    expect(finals).toHaveLength(1)
    expect(finalAt(seen).text).toBe('so tell me about')
    await a.stop()
  })

  it('discards the early result when speech resumes before it lands, so a pause inside a turn never ends it', async () => {
    let release: () => void = () => {}
    const gate = new Promise<void>(r => { release = r })
    const { a, seen } = setup({ decode: async (pcm, kind) => { if (kind !== 'final') return 'x'; if (pcm.length < 16 * 2000) { await gate; return 'First half.' } return 'First half. Second half.' } })
    await a.start(FAST)
    await feed(a, concat(silence(300), tone(1000), silence(300))) // pause > early window, < full wait: the early decode starts and stays pending
    await feed(a, tone(1000)) // speech resumes
    release(); await settle()
    expect(seen.filter(s => s[0] === 'final')).toHaveLength(0)
    await feed(a, silence(1000)); await settle()
    const finals = seen.filter(s => s[0] === 'final')
    expect(finals).toHaveLength(1)
    expect(finals[0]![1].text).toBe('First half. Second half.')
    await a.stop()
  })

  it('does nothing different without the flag', async () => {
    const { a, seen } = setup({ decode: async () => 'Tell me about yourself.' })
    await a.start({ ...OPTS, endSilenceMs: 650 })
    await feed(a, concat(silence(300), tone(1500), silence(1000)))
    await settle()
    expect(finalAt(seen).t1).toBeGreaterThanOrEqual(SPEECH_END + 650)
    await a.stop()
  })
})
