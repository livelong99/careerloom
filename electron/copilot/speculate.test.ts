import { describe, expect, it } from 'vitest'

import { DEFAULT_CONFIG } from './config'
import type { AnswerEngine, AnswerRequest } from './engine'
import { createSpeculator, wordDistanceRatio } from './speculate'
import type { Suggestion, TranscriptLine } from './types'

const cfg = () => ({ ...DEFAULT_CONFIG, engine: { ...DEFAULT_CONFIG.engine, autoAnswer: true, speculativeStart: true } })
const partial = (text: string, id = 'system-S-0'): TranscriptLine => ({ id, speaker: 'interviewer', text, final: false, t0: 0, t1: null })
const sug = (q: string, say: string, done: boolean): Suggestion => ({ questionId: q, model: 'm', tier: 'fast', say, bullets: [], star: null, proof: [], flags: [], done, firstTokenMs: 1, totalMs: null, costUsd: null })

function fakeEngine() {
  const reqs: AnswerRequest[] = []
  const aborted: boolean[] = []
  let release: () => void = () => {}
  const gate = new Promise<void>(r => { release = r })
  const engine: AnswerEngine = {
    cancelAll() {},
    answer(req) {
      reqs.push(req)
      const i = reqs.length - 1
      req.signal.addEventListener('abort', () => { aborted[i] = true })
      return (async function* () { yield sug(req.question.id, 'Open with', false); await gate; if (req.signal.aborted) return; yield sug(req.question.id, 'Open with the goal.', true) })()
    },
  }
  return { engine, reqs, aborted, release }
}
const tick = () => new Promise(r => setImmediate(r))
const drain = async (it: AsyncIterable<Suggestion>) => { const out: Suggestion[] = []; for await (const s of it) out.push(s); return out }

describe('word distance', () => {
  it('is 0 for identical text modulo case/punctuation and grows with edits', () => {
    expect(wordDistanceRatio('Tell me about yourself.', 'tell me about yourself')).toBe(0)
    expect(wordDistanceRatio('tell me about a time', 'tell me about a time you failed at scale')).toBeGreaterThan(0.4)
    expect(wordDistanceRatio('why do you want to work here', 'why do you want to work there')).toBeCloseTo(1 / 7, 5)
  })
})

describe('speculative start', () => {
  const lines = () => [] as TranscriptLine[]
  it('starts only on a finished, question-shaped interviewer partial and only when enabled', async () => {
    const f = fakeEngine()
    const s = createSpeculator({ engine: f.engine, transcript: lines, config: cfg })
    s.onPartial(partial('tell me about')); s.onPartial(partial('okay great.')); s.onPartial({ ...partial('Tell me about yourself.'), speaker: 'you' })
    expect(f.reqs).toHaveLength(0)
    const off = createSpeculator({ engine: f.engine, transcript: lines, config: () => ({ ...cfg(), engine: { ...cfg().engine, speculativeStart: false } }) })
    off.onPartial(partial('Tell me about yourself.'))
    expect(f.reqs).toHaveLength(0)
    s.onPartial(partial('Tell me about yourself.')); s.onPartial(partial('Tell me about yourself.')) // same line: one request
    expect(f.reqs).toHaveLength(1)
    s.cancel()
  })

  it('hit: the final matches, held output is released under the final question id, hit rate 1', async () => {
    const f = fakeEngine()
    const s = createSpeculator({ engine: f.engine, transcript: lines, config: cfg })
    s.onPartial(partial('Why do you want to work here?'))
    await tick()
    const run = s.take('system-S-0', 'Why do you want to work here', 'qF')
    expect(run).not.toBeNull()
    f.release()
    const out = await drain(run!.stream)
    expect(out.map(x => x.questionId)).toEqual(['qF', 'qF'])
    expect(out.at(-1)!.done).toBe(true)
    expect(s.stats()).toMatchObject({ started: 1, hits: 1, misses: 0, hitRate: 1, wastedTokens: 0 })
    expect(f.aborted[0]).toBeFalsy()
  })

  it('miss: a materially different final aborts the speculative request and counts wasted tokens', async () => {
    const f = fakeEngine()
    const s = createSpeculator({ engine: f.engine, transcript: lines, config: cfg })
    s.onPartial(partial('Tell me about a time.'))
    await tick()
    expect(s.take('system-S-0', 'Tell me about a time you led a migration across three teams', 'qF')).toBeNull()
    expect(f.aborted[0]).toBe(true)
    expect(s.stats()).toMatchObject({ started: 1, hits: 0, misses: 1, hitRate: 0 })
    expect(s.stats().wastedTokens).toBeGreaterThan(0)
  })

  it('take without a speculative run for that line is null and costs nothing', () => {
    const s = createSpeculator({ engine: fakeEngine().engine, transcript: lines, config: cfg })
    expect(s.take('nope', 'Why?', 'qF')).toBeNull()
    expect(s.stats().started).toBe(0)
  })

  it('stops speculating for the session after three misses in a row (spend guard)', async () => {
    const f = fakeEngine()
    const s = createSpeculator({ engine: f.engine, transcript: lines, config: cfg })
    for (let i = 0; i < 3; i++) { s.onPartial(partial('Tell me about a time.', `L${i}`)); await tick(); s.take(`L${i}`, 'something completely different and much longer than before', `q${i}`) }
    expect(s.stats().disabled).toBe(true)
    s.onPartial(partial('Tell me about a time.', 'L9'))
    expect(f.reqs).toHaveLength(3)
  })

  it('an engine error in a held run does not escape; take then falls back (null)', async () => {
    const engine: AnswerEngine = { cancelAll() {}, answer: () => (async function* (): AsyncGenerator<Suggestion> { throw new Error('budget') })() }
    const s = createSpeculator({ engine, transcript: lines, config: cfg })
    s.onPartial(partial('Why do you want to work here?'))
    await tick()
    expect(s.take('system-S-0', 'Why do you want to work here?', 'qF')).toBeNull()
  })
})
