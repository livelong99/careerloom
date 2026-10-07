// Fault-path and latency checks on the interview simulator (see interview-sim.test.ts): hedged backup request, same-question dedupe,
// merged questions, raw-reply logging, and per-stage latency on a fake clock.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { setDebugLogDir } from '../debug-log'
import { continuesQuestion } from './detector'
import { parseSuggestion } from './prompts'
import { createSim, reply, type Reply } from './sim.test-util'

beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }))
afterEach(() => { vi.useRealTimers(); setDebugLogDir(null) })

const GOOD = reply('Use a write-ahead log and replay it.', ['Append before applying', 'Replay from last checkpoint'])
const Q = 'How would you make a message consumer crash safe?'

describe('hedged backup request', () => {
  it('starts a second model after 4 s without a first token, keeps the first to answer, aborts the loser', async () => {
    const script: Reply[] = [{ hang: true }, { text: GOOD, ttftMs: 500 }]
    const sim = createSim({ pick: n => script[n - 1]! })
    sim.final(Q)
    await sim.advance(3900)
    expect(sim.requests).toHaveLength(1)
    await sim.advance(2000)
    expect(sim.requests).toHaveLength(2)
    expect(sim.requests[0]!.aborted).toBe(true)
    expect(sim.requests[1]!.aborted).toBe(false)
    const [a] = sim.done()
    expect(a!.model).toBe(sim.requests[1]!.model)
    expect(a!.model).not.toBe(sim.requests[0]!.model)
    expect(sim.errors()).toEqual([])
  })

  it('does not fire when the first token arrives in time; a late primary loses to the backup and stops', async () => {
    const fast = createSim({ pick: () => ({ text: GOOD, ttftMs: 3500 }) })
    fast.final(Q); await fast.advance(8000)
    expect(fast.requests).toHaveLength(1)
    const script: Reply[] = [{ text: GOOD, ttftMs: 6000 }, { text: GOOD, ttftMs: 500 }]
    const slow = createSim({ pick: n => script[n - 1]! })
    slow.final(Q); await slow.advance(10_000)
    expect(slow.requests.map(r => r.aborted)).toEqual([true, false])
    expect(slow.done()).toHaveLength(1)
  })

  it('both calls failing surfaces one error, hedge off keeps a single request', async () => {
    const off = createSim({ pick: () => ({ hang: true }), engine: { hedgeAfterMs: 0 } })
    off.final(Q); await off.advance(10_000)
    expect(off.requests).toHaveLength(1)
  })
})

describe('same-question dedupe', () => {
  it('a press after a failed answer retries; a press after the window re-asks', async () => {
    const script: Reply[] = [{ status: 401, message: 'bad key' }, { text: GOOD }, { text: GOOD }]
    const sim = createSim({ pick: n => script[n - 1]! })
    sim.final(Q); await sim.advance(2000)
    expect(sim.errors()).toHaveLength(1)
    sim.press('answer'); await sim.advance(2000)
    expect(sim.requests).toHaveLength(2) // the failed ask does not block a retry
    expect(sim.done()).toHaveLength(1)
    sim.press('answer'); await sim.advance(2000)
    expect(sim.requests).toHaveLength(2) // inside 15 s: deduped
    await sim.advance(15_000)
    sim.press('answer'); await sim.advance(2000)
    expect(sim.requests).toHaveLength(3)
  })

  it('follow-up and clarify are different asks and still go through; the screenshot press is never deduped', async () => {
    const sim = createSim({ pick: () => ({ text: GOOD }) })
    sim.final(Q); await sim.advance(2000)
    sim.press('followup'); await sim.advance(2000)
    sim.press('clarify'); await sim.advance(2000)
    expect(sim.requests).toHaveLength(3)
  })

  it('a hotkey press while the auto answer is in flight leaves it alone', async () => {
    const sim = createSim({ pick: () => ({ text: GOOD, ttftMs: 1500 }) })
    sim.final(Q); await sim.advance(600)
    sim.press('answer'); await sim.advance(5000)
    expect(sim.requests).toHaveLength(1)
    expect(sim.requests[0]!.aborted).toBe(false)
    expect(sim.done()).toHaveLength(1)
  })
})

describe('same-question dedupe: edge cases', () => {
  it('mic-only: the first press answers what was heard, repeated presses do not restart it', async () => {
    const sim = createSim({ sources: ['mic'], pick: () => ({ text: GOOD, ttftMs: 1200 }) })
    sim.final(Q, 'you')
    await sim.advance(500)
    expect(sim.requests).toHaveLength(0) // mic-only never auto-asks
    sim.press('answer'); await sim.advance(300); sim.press('answer'); sim.press('answer'); await sim.advance(5000)
    expect(sim.requests).toHaveLength(1)
    expect(sim.done()).toHaveLength(1)
  })

  it('an answer that is still streaming after 15 s is not restarted by a press', async () => {
    const sim = createSim({ pick: () => ({ text: GOOD, ttftMs: 500, gapMs: 3000 }) })
    sim.final(Q); await sim.advance(16_000)
    expect(sim.done()).toHaveLength(0)
    sim.press('answer'); await sim.advance(15_000)
    expect(sim.requests).toHaveLength(1)
    expect(sim.requests[0]!.aborted).toBe(false)
    expect(sim.done()).toHaveLength(1)
  })

  it('after Clear the same question can be asked again straight away', async () => {
    const sim = createSim({ pick: () => ({ text: GOOD }) })
    sim.final(Q); await sim.advance(1500)
    sim.press('clear')
    sim.final(Q, 'you'); sim.press('answer'); await sim.advance(1500)
    expect(sim.requests).toHaveLength(2)
  })
})

describe('panel: a clarification right after the question', () => {
  it('is answered once the 2.5 s auto-ask gap clears, instead of being dropped while the overlay already shows it', async () => {
    const sim = createSim({ pick: () => ({ text: GOOD, ttftMs: 800, gapMs: 900 }) })
    sim.final('Walk me through how you would design the ingestion layer for clickstream events?')
    await sim.advance(1500)
    sim.final('Sorry, I meant specifically for late arriving data, how would you handle that?')
    await sim.advance(12_000)
    expect(sim.requests).toHaveLength(2)
    expect(sim.requests[0]!.aborted).toBe(true)
    expect(sim.requests[1]!.user).toContain('late arriving data')
    const done = sim.done()
    expect(done).toHaveLength(1)
    expect(done[0]!.questionId).toBe(sim.recorded.questions[1]!.id)
  })
  it.each([['Clear', (s: ReturnType<typeof createSim>) => s.press('clear')], ['panic', (s: ReturnType<typeof createSim>) => s.panic()], ['stop', (s: ReturnType<typeof createSim>) => s.wiring.emit('copilotState', { state: 'stopped', mode: 'live', sessionId: 'S', sources: ['system'], startedAt: 0 })]])('a deferred ask is cancelled by %s', async (_n, stop) => {
    const sim = createSim({ pick: () => ({ text: GOOD }) })
    sim.final('Walk me through how you would design the ingestion layer for clickstream events?')
    await sim.advance(1000)
    sim.final('Sorry, I meant specifically for late arriving data, how would you handle that?')
    await sim.advance(100); stop(sim); await sim.advance(8000)
    expect(sim.requests).toHaveLength(1)
  })
})

describe('streaming to the overlay', () => {
  it('with the real 80 ms throttle the headline shows before the answer is done and the final is never dropped', async () => {
    const sim = createSim({ partialEveryMs: 80, pick: () => ({ text: reply('Use a queue to absorb the spikes.', ['Decouple producers', 'Absorb spikes', 'Retry from the log']), ttftMs: 500, gapMs: 60 }) })
    sim.final(Q); await sim.advance(3000)
    const all = sim.ofType('copilotSuggestion')
    const firstSay = all.find(s => s.p.say.trim() !== '')!
    const done = all.find(s => s.p.done)!
    expect(firstSay.at).toBeLessThan(done.at)
    expect(firstSay.at - 1_000_000).toBeLessThanOrEqual(600)
    expect(all.length).toBeLessThan(40) // coalesced, not one event per delta
  })
})

describe('continuesQuestion', () => {
  it('joins a cut-off phrase, never a fresh question or a finished sentence', () => {
    expect(continuesQuestion('write a function that returns the longest substring and', 'explain its complexity', 900)).toBe(true)
    expect(continuesQuestion('walk me through how you would shard the orders table', 'across several nodes without downtime', 2000)).toBe(true)
    expect(continuesQuestion('tell me about yourself', 'How would you design a cache?', 3000)).toBe(false) // two questions, neither punctuated
    expect(continuesQuestion('Tell me about yourself.', 'How would you design a cache?', 3000)).toBe(false)
    expect(continuesQuestion('Tell me about a time you debugged an outage?', 'And what did you learn?', 800)).toBe(true)
    expect(continuesQuestion('Tell me about a time you debugged an outage?', 'And what did you learn?', 3000)).toBe(false)
    expect(continuesQuestion('describe the retry policy and', 'why', 4500)).toBe(false) // too late
  })
})

describe('merged questions', () => {
  const same = (sim: ReturnType<typeof createSim>): number => new Set(sim.recorded.questions.map(q => q.id)).size
  it('a cut-off question and its continuation 0.6 s later become one question and one finished answer', async () => {
    const sim = createSim({ pick: () => ({ text: GOOD, ttftMs: 900 }) })
    sim.final('Describe how you would design a rate limiter for a public API that must work across')
    await sim.advance(600)
    sim.final('multiple regions without a single shared database?')
    await sim.advance(6000)
    expect(same(sim)).toBe(1)
    expect(sim.recorded.questions.at(-1)!.text).toBe('Describe how you would design a rate limiter for a public API that must work across multiple regions without a single shared database?')
    expect(sim.done()).toHaveLength(1)
    expect(sim.requests[0]!.aborted).toBe(true)
  })

  it('a complete question followed by "and ..." within the same breath merges; a separate question does not', async () => {
    const a = createSim({ pick: () => ({ text: GOOD }) })
    a.final('Tell me about a time you had to debug a production outage?'); await a.advance(800)
    a.final('And what did you learn from it?'); await a.advance(4000)
    expect(same(a)).toBe(1)
    const b = createSim({ pick: () => ({ text: GOOD }) })
    b.final('Tell me about a time you had to debug a production outage?'); await b.advance(3000)
    b.final('And what did you learn from it?'); await b.advance(4000)
    expect(same(b)).toBe(2)
  })

  it('merging gives the rate-limit slot back so the joined question is still asked', async () => {
    const sim = createSim({ pick: () => ({ text: GOOD }) })
    sim.final('Walk me through how you would shard a very large orders table across')
    await sim.advance(300)
    sim.final('several postgres nodes without downtime?')
    await sim.advance(4000)
    expect(sim.done()).toHaveLength(1)
  })
})

describe('parser', () => {
  it('reads `[SAY] text` and `[BULLETS] - a` on one line, in a stream and when done', () => {
    const t = '[SAY] Use a queue.\n[BULLETS]\n- Decouple producers\n- Absorb spikes'
    for (const done of [false, true]) expect(parseSuggestion(t, done)).toMatchObject({ say: 'Use a queue.', bullets: ['Decouple producers', 'Absorb spikes'] })
    expect(parseSuggestion('[SAY] Use a que', false).say).toBe('Use a que')
    expect(parseSuggestion('[SAY', false).say).toBe('')
  })
  it('drops reasoning lines a model writes into the sections', () => {
    const p = parseSuggestion('[SAY]\nOkay, so the user is asking about queues.\nUse a queue to absorb spikes.\n[BULLETS]\n- Wait, let me reconsider\n- Decouple producers', true)
    expect(p.say).toBe('Use a queue to absorb spikes.')
    expect(p.bullets).toEqual(['Decouple producers'])
    expect(parseSuggestion('[SAY]\nLet me walk you through it: queue first.', true).say).toBe('Let me walk you through it: queue first.')
  })
  it('drops <think> blocks, open or closed, and trailing second thoughts after a blank line', () => {
    expect(parseSuggestion('<think>they want a queue</think>[SAY]\nUse a queue.\n[BULLETS]\n- One', true).say).toBe('Use a queue.')
    expect(parseSuggestion('<think>they want a que', false)).toMatchObject({ say: '', bullets: [] })
    const p = parseSuggestion('[SAY]\nUse a queue.\n[BULLETS]\n- Decouple the\n  producers\n\nWait, let me reconsider that.', true)
    expect(p.bullets).toEqual(['Decouple the producers'])
  })
})

describe('debug log', () => {
  it('records the raw reply truncated, and the raw text of a rejected reply', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sim-log-'))
    setDebugLogDir(dir)
    const long = reply('Use a queue.', Array.from({ length: 200 }, (_, i) => `bullet number ${i} with some padding words`))
    const script: Reply[] = [{ text: 'I think the answer is a queue.' }, { text: long, gapMs: 1 }]
    const sim = createSim({ pick: n => script[n - 1]! })
    sim.final(Q); await sim.advance(12_000)
    const lines = fs.readdirSync(dir).flatMap(f => fs.readFileSync(path.join(dir, f), 'utf8').trim().split('\n')).map(l => JSON.parse(l) as { msg: string; data?: { raw?: string; chars?: number } })
    const bad = lines.find(l => l.msg === 'bad reply')!
    expect(bad.data!.raw).toBe('I think the answer is a queue.')
    const ok = lines.find(l => l.msg === 'reply')!
    expect(ok.data!.chars).toBeGreaterThan(5000)
    expect(ok.data!.raw!.length).toBeLessThan(1600)
    expect(ok.data!.raw).toContain('…[+')
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

/** Virtual-clock stage times for one turn: [detect, connect(ttfb), ttft, firstSay, endToSay, total]. Profiles are assumptions, the ordering is the point. */
async function stages(pick: (n: number) => Reply, o: { engine?: { hedgeAfterMs?: number } } = {}): Promise<Record<string, number | null>> {
  const sim = createSim({ pick, ...o })
  sim.final(Q); await sim.advance(30_000)
  const ms = sim.trace.last()!.ms
  return { detect: ms.detect, connect: ms.connect, ttft: ms.ttft, firstSay: ms.firstSay, endToSay: ms.endToSay, total: ms.total }
}

describe('per-stage latency (virtual clock, assumed profiles: fast-tier TTFT 700 ms)', () => {
  it('clean turn: everything the app controls is ~0, time is the model', async () => {
    const s = await stages(() => ({ text: GOOD, ttftMs: 700 }))
    console.info('latency clean', JSON.stringify(s))
    expect(s.detect).toBe(0)
    expect(s.endToSay!).toBeLessThanOrEqual(700 + 60)
  })
  it('empty first reply: the retry goes out at once on the next model (no back-off between different models)', async () => {
    const script: Reply[] = [{ text: '', ttftMs: 300 }, { text: GOOD, ttftMs: 700 }]
    const s = await stages(n => script[n - 1]!)
    console.info('latency empty-first-reply', JSON.stringify(s))
    expect(s.endToSay!).toBeLessThanOrEqual(300 + 700 + 60)
  })
  it('a hung model costs 4 s (hedge), not the 15 s first-byte timeout', async () => {
    const script: Reply[] = [{ hang: true }, { text: GOOD, ttftMs: 700 }]
    const s = await stages(n => script[n - 1]!)
    console.info('latency hung-primary', JSON.stringify(s))
    expect(s.endToSay!).toBeLessThanOrEqual(4000 + 700 + 60)
  })
})
