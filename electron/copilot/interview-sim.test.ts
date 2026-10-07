// Five scripted interviews through the real live-wiring -> detector -> auto-ask -> engine -> provider(SSE) -> guard -> overlay events chain,
// on a fake clock with a scripted fake OpenRouter. Timings are virtual (profiles are assumptions): they prove ordering and cancellation logic
// and which stage dominates, not real model speed.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createSim, reply, words, type Reply, type Sim } from './sim.test-util'
import type { Suggestion } from './types'

beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }))
afterEach(() => vi.useRealTimers())

const LEAK = /<think>|\bthe user (?:is|asks|wants)\b|\blet me (?:think|reconsider)\b|\bwait,|\bI need to\b|\bokay, so\b/i
const PROOF = '\n[PROOF]\n- "Built Kafka pipelines at Globex for 3 years." | cv.md'

/** The contract every answer must meet: short, structured, no reasoning, proof only for behavioural. */
function expectFormat(s: Suggestion, o: { behavioural: boolean }): void {
  const headline = s.say.split(/(?<=[.!?])\s/)[0]!
  expect(words(headline), `headline: ${headline}`).toBeLessThanOrEqual(15)
  expect(s.bullets.length).toBeGreaterThan(0)
  for (const b of s.bullets) expect(words(b), `bullet: ${b}`).toBeLessThanOrEqual(12)
  expect(`${s.say}\n${s.bullets.join('\n')}`).not.toMatch(LEAK)
  if (!o.behavioural) expect(s.proof).toEqual([])
}
/** Deltas reached the overlay before the final, with the headline visible early. */
function expectStreamed(sim: Sim, questionId: string): void {
  const all = sim.ofType('copilotSuggestion').filter(s => s.p.questionId === questionId)
  const partials = all.filter(s => !s.p.done)
  const done = all.find(s => s.p.done)!
  expect(partials.length).toBeGreaterThanOrEqual(2)
  expect(partials.some(s => s.p.say.trim() !== '' && s.at < done.at)).toBe(true)
}
const detected = (sim: Sim): string[] => sim.recorded.questions.map(q => q.text)

describe('interview 1: behavioural (small talk, silence, follow-up)', () => {
  it('asks once per real question, ignores small talk and silence, PROOF only here', async () => {
    const sim = createSim({ pick: n => ({ text: n === 1
      ? reply('I raised it early and we agreed on a spike.', ['Listened to their concern first', 'Ran a one-day spike', 'Shipped the agreed option'], PROOF)
      : reply('I would write the decision down sooner.', ['Share a one-page doc', 'Ask for dissent early']), ttftMs: 500 }) })
    sim.final('Hi, thanks for joining, how are you today?')
    await sim.advance(20_000) // silence
    expect(sim.requests).toHaveLength(0)
    sim.final('Tell me about a time you disagreed with a teammate and how you resolved it?')
    await sim.advance(4000)
    sim.final('You', 'you') // the candidate's own voice is never a question
    sim.final('And what would you do differently next time?')
    await sim.advance(4000)
    expect(detected(sim)).toEqual(['Tell me about a time you disagreed with a teammate and how you resolved it?', 'And what would you do differently next time?'])
    expect(sim.requests).toHaveLength(2)
    const [a, b] = sim.done()
    expectFormat(a!, { behavioural: true }); expectFormat(b!, { behavioural: true })
    expect(a!.proof).toHaveLength(1) // verbatim cv quote survives the guard
    expectStreamed(sim, sim.recorded.questions[0]!.id)
    expect(sim.errors()).toEqual([])
  })
})

describe('interview 2: technical coding (question split across STT finals, inline [SAY], leaked PROOF)', () => {
  it('merges the split question into one question and one answer; parses `[SAY] text`; drops PROOF for non-behavioural', async () => {
    const sim = createSim({ pick: () => ({ text: '[SAY] Expand around each centre in O(n²).\n[BULLETS]\n- Odd and even centres\n- Track best start and length\n- O(1) extra space\n[PROOF]\n- "Built Kafka pipelines at Globex for 3 years." | cv.md', ttftMs: 600 }) })
    sim.final('Write a function that returns the longest palindromic substring of a string and')
    await sim.advance(500) // the STT chunker cut the sentence here
    sim.final('explain its time complexity compared to a dynamic programming approach?')
    await sim.advance(5000)
    // The fragment was asked first (nothing marks it as cut off); its request is aborted and replaced, one question entry, one answer.
    expect(sim.requests).toHaveLength(2)
    expect(sim.requests[0]!.aborted).toBe(true)
    expect(sim.requests[1]!.user).toContain('dynamic programming')
    expect(new Set(sim.recorded.questions.map(q => q.id)).size).toBe(1)
    expect(sim.done()).toHaveLength(1)
    const [a] = sim.done()
    expect(a!.say).toBe('Expand around each centre in O(n²).')
    expectFormat(a!, { behavioural: false })
  })
})

describe('interview 3: system design (long multi-part question, slow first token)', () => {
  it('one question, one deep-tier answer, streamed', async () => {
    const sim = createSim({ pick: () => ({ text: reply('A write-once key service behind a CDN-cached redirect tier.', ['Base62 ids from a counter service', 'Shard by hash of the short id', 'Cache hot ids in Redis']), ttftMs: 1800 }) })
    sim.final('Design a URL shortener. It needs to handle ten million new URLs a day with low latency redirects. How would you shard the database, what would you cache, and how do you keep ids unique across regions?')
    await sim.advance(6000)
    expect(sim.requests).toHaveLength(1)
    expect(sim.recorded.questions[0]!.type).toBe('system-design')
    expectFormat(sim.done()[0]!, { behavioural: false })
    expectStreamed(sim, sim.recorded.questions[0]!.id)
  })
})

describe('interview 4: data-engineering knowledge (empty and malformed model replies fail over)', () => {
  it('first model empty, second malformed, third answers; nothing wrong is shown', async () => {
    const script: Reply[] = [{ text: '' }, { raw: ['{not json'] }, { text: reply('Streaming handles unbounded events, batch handles bounded sets.', ['Kafka Streams for per-event state', 'Spark for heavy joins and backfills']) }]
    const sim = createSim({ pick: n => ({ ...script[n - 1]!, ttftMs: 300 }) })
    sim.final('What is the difference between stream processing and batch processing, and when would you pick Kafka Streams over Spark?')
    await sim.advance(8000)
    expect(sim.requests).toHaveLength(3)
    expect(new Set(sim.requests.map(r => r.model)).size).toBeGreaterThan(1)
    expect(sim.errors()).toEqual([])
    const d = sim.done()
    expect(d).toHaveLength(1)
    expectFormat(d[0]!, { behavioural: false })
    expect(sim.ofType('copilotSuggestion').every(s => s.p.say !== '' || s.p.bullets.length === 0)).toBe(true)
  })

  it('rate limit then reasoning leak before the marker are both survived', async () => {
    const script: Reply[] = [{ status: 429, message: 'rate limited' }, { text: `Okay, so the user is asking about Avro schema evolution. Let me think.\n${reply('Add fields with defaults and keep readers compatible.', ['Backward compatible: new reader old data', 'Never rename, alias instead'])}` }]
    const sim = createSim({ pick: n => script[n - 1]! })
    sim.final('How do you handle schema evolution when producers and consumers deploy independently?')
    await sim.advance(5000)
    expect(sim.requests).toHaveLength(2)
    const [a] = sim.done()
    expectFormat(a!, { behavioural: false })
    expect(a!.say).toBe('Add fields with defaults and keep readers compatible.')
  })
})

describe('interview 5: panel (clarification, interruption, talk-over, repeated hotkey, panic)', () => {
  const answerFor = (n: number): Reply => ({ text: reply(`Answer number ${n} first.`, ['Point one', 'Point two']), ttftMs: 700, gapMs: 150 })

  it('latest question wins, duplicate finals and repeated presses do not restart a good answer', async () => {
    const sim = createSim({ pick: answerFor })
    sim.final('Walk me through how you would migrate a monolith to services?')
    await sim.advance(300)
    sim.final('Walk me through how you would migrate a monolith to services?') // talk-over: STT re-emits the same final
    await sim.advance(2500)
    expect(sim.requests).toHaveLength(1)
    sim.press('answer'); await sim.advance(100); sim.press('answer'); sim.press('answer') // impatient presses on the same question
    await sim.advance(5000)
    expect(sim.requests, 'rapid presses must not re-ask the same question').toHaveLength(1)
    expect(sim.requests[0]!.aborted).toBe(false)
    expect(sim.done()).toHaveLength(1)
    // The interviewer interrupts with a new question while nothing is streaming: a new answer starts.
    sim.final('Sorry to cut in, how do you keep data consistent between those services?')
    await sim.advance(5000)
    expect(sim.requests).toHaveLength(2)
    expect(sim.done()).toHaveLength(2)
  })

  it('a new question mid-answer supersedes it and only the new one completes', async () => {
    const sim = createSim({ pick: n => ({ ...answerFor(n), gapMs: 900 }) })
    sim.final('How would you design the retry policy for a payment webhook consumer?')
    await sim.advance(3000) // answer is streaming slowly
    sim.final('Actually, what happens when the consumer crashes halfway through a batch?')
    await sim.advance(9000)
    expect(sim.requests[0]!.aborted).toBe(true)
    const done = sim.done()
    expect(done).toHaveLength(1)
    expect(done[0]!.questionId).toBe(sim.recorded.questions[1]!.id)
  })

  it('clear and panic mid-answer abort the request and publish nothing more', async () => {
    const sim = createSim({ pick: n => ({ ...answerFor(n), gapMs: 900 }) })
    sim.final('Describe how you would roll out a risky database migration with no downtime?')
    await sim.advance(2500)
    const before = sim.ofType('copilotSuggestion').length
    expect(before).toBeGreaterThan(0)
    sim.press('clear')
    await sim.advance(5000)
    expect(sim.requests[0]!.aborted).toBe(true)
    expect(sim.ofType('copilotSuggestion')).toHaveLength(before)
    expect(sim.ofType('copilotCleared')).toHaveLength(1)
    expect(sim.errors()).toEqual([])
    // panic
    sim.final('And how would you roll that migration back if the replica lags behind?')
    await sim.advance(2500)
    sim.panic()
    const mid = sim.ofType('copilotSuggestion').length
    await sim.advance(8000)
    expect(sim.requests[1]!.aborted).toBe(true)
    expect(sim.ofType('copilotSuggestion')).toHaveLength(mid)
    expect(sim.errors()).toEqual([])
  })
})
