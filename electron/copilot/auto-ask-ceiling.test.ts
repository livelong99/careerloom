import { describe, expect, it } from 'vitest'

import { DEFAULT_CONFIG } from './config'
import { buildGrounding } from './context'
import { createCostMeter } from './cost'
import { createDetector } from './detector'
import { createAnswerEngine, type AnswerProvider, type StreamItem } from './engine'
import { createLiveWiring } from './live-wiring'
import type { CopilotEvents, TranscriptLine } from './types'

// A storm of question-shaped interviewer lines (every one a "false positive" for spend purposes) must stay inside the
// per-session ceiling, whether it is the rate cap or the engine's own ceiling that stops it.
describe('auto-ask spend safety', () => {
  const run = async (ceilingUsd: number, gapMs: number, lines: number) => {
    const cfg = structuredClone(DEFAULT_CONFIG)
    cfg.engine.autoAnswer = true
    let calls = 0
    const provider: AnswerProvider = { id: 'openrouter', stream: async function* () { calls++; yield { delta: '[SAY]\nOk.\n' } as StreamItem; yield { usage: { promptTokens: 100, completionTokens: 20, costUsd: 0.004 } } as StreamItem } }
    const cost = createCostMeter()
    const engine = createAnswerEngine({ provider, config: () => cfg, grounding: () => buildGrounding({ jobId: 'j', title: 'E', company: 'A', report: null, rawReport: null, posting: null }, '# CV'), cost, ceilingUsd, partialEveryMs: 0 })
    let t = 0
    const errors: string[] = []
    const w = createLiveWiring({
      host: { publishState: () => undefined, publish: (ev, p) => { if (ev === 'copilotError') errors.push((p as CopilotEvents['copilotError']).message) }, setSessionHooks: () => undefined, onAction: () => undefined },
      recorder: { line: () => undefined, question: () => undefined, suggestion: () => undefined }, feed: async () => undefined,
      engine, detector: createDetector({ now: () => t }), config: () => cfg, now: () => t, onStopped: () => undefined,
    })
    w.emit('copilotState', { state: 'listening', mode: 'live', sessionId: 'S', sources: ['mic', 'system'], startedAt: 0 })
    for (let i = 0; i < lines; i++) {
      t += gapMs
      const l: TranscriptLine = { id: `l${i}`, speaker: 'interviewer', text: `Tell me about project number ${i}?`, final: true, t0: t, t1: t + 1 }
      w.emit('copilotTranscript', l)
      await new Promise(r => setTimeout(r, 4))
    }
    return { calls, spent: cost.totalUsd(), errors }
  }

  it('the engine ceiling stops answering with a visible message', async () => {
    const r = await run(0.01, 3000, 12)
    expect(r.calls).toBeLessThanOrEqual(3)
    expect(r.spent).toBeLessThanOrEqual(0.012)
    expect(r.errors.some(e => /spend limit/i.test(e))).toBe(true)
  })

  it('the rate cap alone keeps a 60-line storm to 6 answers a minute', async () => {
    const r = await run(1, 1000, 60) // one line per second for a minute
    expect(r.calls).toBeLessThanOrEqual(7)
    expect(r.spent).toBeLessThan(0.03)
  })
})
