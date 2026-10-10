import { describe, expect, it } from 'vitest'

import type { SttEvent } from './adapter'
import { createChunkedAdapter, type Decoder } from './buffer'
import { CONT_EXTRA_MS, holdExtraMs } from './endpoint'
import { concat, frames, hiss, silence, tone } from './pcm-gen.test-util'

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
  it('reports speaking from the first voiced frame until the turn has ended', async () => {
    const { a } = setup()
    await a.start(OPTS)
    expect(a.speaking?.()).toBe(false)
    await feed(a, tone(300))
    expect(a.speaking?.()).toBe(true) // before any text exists
    await feed(a, silence(1000)); await settle()
    expect(a.speaking?.()).toBe(false)
    await a.stop()
  })
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

  it('forces a final when one utterance runs past the window cap, but a 40 s monologue is not cut', async () => {
    const long = setup()
    await long.a.start(OPTS)
    await feed(long.a, concat(silence(300), tone(40_000)))
    await settle()
    expect(long.calls.filter(c => c.kind === 'final')).toHaveLength(0)
    await long.a.stop()
    const { a, calls } = setup()
    await a.start(OPTS)
    await feed(a, concat(silence(300), tone(52_000)))
    await settle()
    expect(calls.filter(c => c.kind === 'final').length).toBe(1)
    expect(calls.find(c => c.kind === 'final')!.ms).toBeLessThanOrEqual(50_100)
    await a.stop()
  })

  it('stops decoding partials past 20 s so a long turn is not delayed behind them', async () => {
    const { a, calls } = setup()
    await a.start(OPTS)
    await feed(a, concat(silence(300), tone(30_000)))
    await settle()
    expect(Math.max(...calls.filter(c => c.kind === 'partial').map(c => c.ms))).toBeLessThanOrEqual(21_000)
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

  it('keeps the full wait (plus the thinking-pause hold) for unfinished text and reuses the early decode (one final decode)', async () => {
    const finals: number[] = []
    const { a, seen } = setup({ decode: async (pcm, kind) => { if (kind === 'final') finals.push(pcm.length); return 'so tell me about' } })
    await a.start(FAST)
    await feed(a, concat(silence(300), tone(1500), silence(4500))) // "…about" trails off, so the hold is the long one
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
    await feed(a, silence(2000)); await settle()
    const finals = seen.filter(s => s[0] === 'final')
    expect(finals).toHaveLength(1)
    expect(finals[0]![1].text).toBe('First half. Second half.')
    await a.stop()
  })

  it('a statement ending a sentence is not a turn end: a 1.5 s pause then more speech stays one final', async () => {
    const { a, seen } = setup({ decode: async (pcm, kind) => (pcm.length < 16 * 2500 ? 'We had a situation last quarter.' : 'We had a situation last quarter. How would you debug it?') })
    await a.start(FAST)
    await feed(a, concat(silence(300), tone(1500), silence(1500), tone(1500), silence(1000)))
    await settle()
    const finals = seen.filter(s => s[0] === 'final')
    expect(finals).toHaveLength(1)
    expect(finals[0]![1].text).toBe('We had a situation last quarter. How would you debug it?')
    await a.stop()
  })

  it('holds a statement final for the extra window, but a question or short prompt still ends early', async () => {
    const stmt = setup({ decode: async () => 'We had a situation last quarter.' })
    await stmt.a.start(FAST)
    await feed(stmt.a, concat(silence(300), tone(1500), silence(2500)))
    await settle()
    expect(finalAt(stmt.seen).t1).toBeGreaterThanOrEqual(SPEECH_END + 650 + CONT_EXTRA_MS)
    expect(finalAt(stmt.seen).t1).toBeLessThan(SPEECH_END + 650 + CONT_EXTRA_MS + 300)
    await stmt.a.stop()
    for (const text of ['Why do you want to work here?', 'Tell me about yourself.']) {
      const q = setup({ decode: async () => text })
      await q.a.start(FAST)
      await feed(q.a, concat(silence(300), tone(1500), silence(1000)))
      await settle()
      expect(finalAt(q.seen).t1).toBeLessThan(SPEECH_END + 450)
      await q.a.stop()
    }
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

describe('long pauses and steady noise', () => {
  const FAST = { ...OPTS, endSilenceMs: 650, fastEndpoint: true }
  const finals = (seen: Array<[string, SttEvent]>) => seen.filter(s => s[0] === 'final')

  it('holds longer when the text so far trails off mid-thought', () => {
    expect(holdExtraMs('so we had an outage and')).toBeGreaterThan(CONT_EXTRA_MS)
    expect(holdExtraMs('Tell me about a time you led a team, um')).toBeGreaterThan(CONT_EXTRA_MS)
    expect(holdExtraMs('We had an outage last quarter.')).toBe(CONT_EXTRA_MS)
    expect(holdExtraMs(null)).toBe(CONT_EXTRA_MS)
  })

  it('a 2.8 s pause after a trailing "and" stays one question', async () => {
    let n = 0
    const { a, seen } = setup({ decode: async (_p, kind) => (kind === 'final' ? (++n === 1 ? 'Tell me about a time you led a migration and' : 'Tell me about a time you led a migration and how you handled the risks?') : 'x') })
    await a.start(FAST)
    await feed(a, concat(silence(300), tone(2500), silence(2800), tone(2500), silence(1500)))
    await settle()
    expect(finals(seen)).toHaveLength(1)
    expect(finals(seen)[0]![1].text).toMatch(/how you handled the risks\?$/)
    await a.stop()
  })

  it('a pause past the hold still ends the turn (the wait is bounded)', async () => {
    const { a, seen } = setup({ decode: async () => 'Tell me about a time you led a migration and' })
    await a.start(FAST)
    await feed(a, concat(silence(300), tone(2500), silence(6000)))
    await settle()
    expect(finals(seen)).toHaveLength(1)
    await a.stop()
  })

  it('steady loud noise that decodes to nothing is dropped, not kept as an endless utterance', async () => {
    const { a, seen, calls } = setup({ decode: async () => '' })
    await a.start(FAST)
    await feed(a, concat(silence(300), hiss(12_000, 4000)))
    await settle()
    expect(finals(seen)).toHaveLength(0)
    expect(calls.filter(c => c.kind === 'partial').length).toBeLessThanOrEqual(4) // it stops decoding noise after the first empty result
    await a.stop()
  })

  it('speech louder than the dropped noise is still heard', async () => {
    let n = 0
    const { a, seen } = setup({ decode: async (_p, kind) => (kind === 'final' ? 'Why do you want this job?' : ++n < 3 ? '' : 'Why') })
    await a.start(FAST)
    await feed(a, concat(silence(300), hiss(6000, 4000), tone(2500, 14000), silence(1500)))
    await settle()
    expect(finals(seen)).toHaveLength(1)
    await a.stop()
  })
})
