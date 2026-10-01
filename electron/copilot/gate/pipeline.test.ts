import { afterEach, describe, expect, it, vi } from 'vitest'

import { createHeuristicGate } from './heuristic'
import { createGatePipeline } from './pipeline'
import type { GateVerdict, QuestionGate } from './types'

afterEach(() => vi.useRealTimers())
const verdict = (over: Partial<GateVerdict> = {}): GateVerdict => ({ isQuestion: true, complete: true, kind: 'behavioural', needsScreenshot: false, deep: false, confidence: 0.9, source: 'jev', ms: 5, ...over })
const model = (decide: QuestionGate['decide']): QuestionGate & { calls: number } => { const m = { id: 'jev' as const, calls: 0, decide: (i: Parameters<QuestionGate['decide']>[0], s?: AbortSignal) => { m.calls++; return decide(i, s) } }; return m }
const AMBIGUOUS = { text: 'in your last job what was the hardest bug to track down', speaker: 'interviewer' as const }

describe('gate pipeline: heuristic first, model only when ambiguous', () => {
  it('never calls the model for a confident heuristic answer or for the candidate', async () => {
    const m = model(async () => verdict())
    const g = createGatePipeline({ heuristic: createHeuristicGate(), model: m })
    expect((await g.decide({ text: 'Tell me about yourself.', speaker: 'interviewer' })).source).toBe('heuristic')
    expect((await g.decide({ text: 'okay great', speaker: 'interviewer' })).isQuestion).toBe(false)
    await g.decide({ ...AMBIGUOUS, speaker: 'you' })
    expect(m.calls).toBe(0)
  })

  it('asks the model for an ambiguous interviewer line and returns its verdict', async () => {
    const m = model(async () => verdict({ kind: 'behavioural' }))
    const g = createGatePipeline({ heuristic: createHeuristicGate(), model: m })
    expect(await g.decide(AMBIGUOUS)).toMatchObject({ source: 'jev', isQuestion: true })
    expect(g.stats()).toMatchObject({ modelCalls: 1, fallbacks: 0 })
  })

  it('hard 600 ms timeout: a hung model call falls back to the heuristic verdict and aborts the request', async () => {
    vi.useFakeTimers()
    let aborted = false
    const m = model((_i, s) => new Promise<GateVerdict>(() => { s?.addEventListener('abort', () => { aborted = true }) }))
    const g = createGatePipeline({ heuristic: createHeuristicGate(), model: m })
    const p = g.decide(AMBIGUOUS)
    await vi.advanceTimersByTimeAsync(599)
    let settled = false; void p.then(() => { settled = true })
    await vi.advanceTimersByTimeAsync(0)
    expect(settled).toBe(false)
    await vi.advanceTimersByTimeAsync(2)
    expect(await p).toMatchObject({ source: 'heuristic', isQuestion: null })
    expect(aborted).toBe(true)
    expect(g.stats()).toMatchObject({ modelCalls: 1, timeouts: 1, fallbacks: 1 })
  })

  it('a model error or an unsure model answer falls back; the pipeline never throws', async () => {
    const boom = createGatePipeline({ heuristic: createHeuristicGate(), model: model(async () => { throw new Error('HTTP 500') }) })
    expect((await boom.decide(AMBIGUOUS)).source).toBe('heuristic')
    const unsure = createGatePipeline({ heuristic: createHeuristicGate(), model: model(async () => verdict({ isQuestion: null })) })
    expect((await unsure.decide(AMBIGUOUS)).source).toBe('heuristic')
  })

  it('records round-trip times for the probe (p50/p95)', async () => {
    let t = 0
    const g = createGatePipeline({ heuristic: createHeuristicGate(), model: model(async () => verdict({ ms: 100 + (t += 50) })) })
    for (let i = 0; i < 4; i++) await g.decide(AMBIGUOUS)
    expect(g.stats().rtt.p50).toBeGreaterThan(0)
    expect(g.stats().rtt.p95).toBeGreaterThanOrEqual(g.stats().rtt.p50!)
  })
})
