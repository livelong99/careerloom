import { describe, expect, it, vi } from 'vitest'

import { createDetector } from './detector'
import type { AnswerEngine } from './engine'
import { createLiveWiring, type WiringDeps } from './live-wiring'
import { DEFAULT_CONFIG } from './config'
import type { CopilotEvents, Suggestion, TranscriptLine } from './types'

const line = (id: string, speaker: TranscriptLine['speaker'], text: string, final = true): TranscriptLine => ({ id, speaker, text, final, t0: 0, t1: final ? 1 : null })
const suggestion = (questionId: string, done: boolean): Suggestion => ({ questionId, model: 'm', tier: 'fast', say: 'Hi', bullets: [], star: null, proof: [], flags: [], done, firstTokenMs: 10, totalMs: done ? 50 : null, costUsd: done ? 0.001 : null })
const state = (s: CopilotEvents['copilotState']['state'], mode: 'live' | 'practice' = 'live'): CopilotEvents['copilotState'] => ({ state: s, mode, sessionId: 'S1', sources: ['mic'], startedAt: 1 })

function setup(over: Partial<WiringDeps> = {}, engine?: AnswerEngine) {
  const published: Array<[string, unknown]> = []
  const states: unknown[] = []
  let hooks: { stopCapture(): unknown; abortRequests(): void } | null = null
  const actions: Array<(a: string) => void> = []
  const recorded = { lines: [] as TranscriptLine[], questions: [] as unknown[], suggestions: [] as Suggestion[] }
  const cancelAll = vi.fn()
  const eng: AnswerEngine = engine ?? { answer: async function* (req) { yield suggestion(req.question.id, false); yield suggestion(req.question.id, true) }, cancelAll }
  const feed = vi.fn(async () => undefined)
  const onStopped = vi.fn()
  const cfg = structuredClone(DEFAULT_CONFIG)
  const w = createLiveWiring({
    host: {
      publishState: s => void states.push(s), publish: (n, p) => void published.push([n, p]),
      setSessionHooks: h => { hooks = h }, onAction: cb => void actions.push(cb as (a: string) => void),
    },
    recorder: { line: l => void recorded.lines.push(l), question: q => void recorded.questions.push(q), suggestion: s => void recorded.suggestions.push(s) },
    feed, engine: eng, detector: createDetector({ now: () => 0 }), config: () => cfg, now: () => 1000, onStopped, ...over,
  })
  const session = { stop: vi.fn(async () => undefined) }
  w.bindSession(session)
  return { w, published, states, hooks: () => hooks!, actions, recorded, feed, onStopped, session, cancelAll, of: (n: string) => published.filter(p => p[0] === n).map(p => p[1]), cfg }
}

describe('live wiring', () => {
  it('forwards every state change to the overlay host and reports the stop once', () => {
    const { w, states, onStopped } = setup()
    w.emit('copilotState', state('armed')); w.emit('copilotState', state('listening')); w.emit('copilotState', state('stopped'))
    expect(states.map(s => (s as { state: string }).state)).toEqual(['armed', 'listening', 'stopped'])
    expect(onStopped).toHaveBeenCalledTimes(1)
  })

  it('the kill-switch hooks stop capture and abort engine requests', async () => {
    const { hooks, session, cancelAll } = setup()
    await hooks().stopCapture()
    expect(session.stop).toHaveBeenCalledWith('panic')
    hooks().abortRequests()
    expect(cancelAll).toHaveBeenCalled()
  })

  it('records and publishes transcript lines; health, level and error pass straight through', () => {
    const { w, recorded, of } = setup()
    w.emit('copilotState', state('listening'))
    w.emit('copilotTranscript', line('a', 'you', 'hel', false))
    w.emit('copilotLevel', { source: 'mic', level: 0.4 })
    w.emit('copilotHealth', { source: 'mic', status: 'silent', level: 0 })
    w.emit('copilotError', { kind: 'stt', message: 'x', retrying: true })
    expect(recorded.lines).toHaveLength(1)
    expect(of('copilotTranscript')).toHaveLength(1)
    expect([of('copilotLevel'), of('copilotHealth'), of('copilotError')].map(a => a.length)).toEqual([1, 1, 1])
  })

  it('live mic-only: a final that looks like a question is detected, recorded and published (no auto answer by default)', async () => {
    const { w, recorded, of } = setup()
    w.emit('copilotState', state('listening'))
    w.emit('copilotTranscript', line('a', 'you', 'Tell me about a time you led a team through a hard project?'))
    await vi.waitFor(() => expect(of('copilotQuestion')).toHaveLength(1))
    expect(recorded.questions).toHaveLength(1)
    expect(of('copilotSuggestion')).toHaveLength(0)
  })

  it('practice mode never runs the detector on the candidate’s own speech', async () => {
    const { w, of } = setup()
    w.emit('copilotState', state('listening', 'practice'))
    w.emit('copilotTranscript', line('a', 'you', 'Why did I pick this company?'))
    await Promise.resolve()
    expect(of('copilotQuestion')).toHaveLength(0)
  })

  it('autoAnswer streams a suggestion for a detected question', async () => {
    const { w, of, cfg } = setup()
    cfg.engine.autoAnswer = true
    w.emit('copilotState', state('listening'))
    w.emit('copilotTranscript', line('a', 'you', 'What is your biggest weakness?'))
    await vi.waitFor(() => expect(of('copilotSuggestion')).toHaveLength(2))
  })

  it('answer on demand uses the last detected question, records suggestions and streams partial then final', async () => {
    const { w, of, recorded } = setup()
    w.emit('copilotState', state('listening'))
    w.emit('copilotTranscript', line('a', 'you', 'How would you design a rate limiter?'))
    await vi.waitFor(() => expect(of('copilotQuestion')).toHaveLength(1))
    const qid = (of('copilotQuestion')[0] as { id: string }).id
    await w.answer('answer')
    expect((of('copilotSuggestion') as Suggestion[]).map(s => [s.questionId, s.done])).toEqual([[qid, false], [qid, true]])
    expect(recorded.suggestions).toHaveLength(2)
  })

  it('answer without a detected question answers the last thing heard; with nothing heard it says so', async () => {
    const { w, of } = setup()
    w.emit('copilotState', state('listening'))
    await w.answer('answer')
    expect(of('copilotError')).toEqual([{ kind: 'engine', message: expect.stringMatching(/nothing to answer/i), retrying: false }])
    w.emit('copilotTranscript', line('b', 'you', 'so the thing about the migration'))
    await w.answer('answer')
    expect(of('copilotQuestion')).toHaveLength(1)
    expect(of('copilotSuggestion')).toHaveLength(2)
  })

  it('pressing answer while the question is still a partial answers that text, and its final is not detected a second time', async () => {
    const { w, of } = setup()
    w.emit('copilotState', state('listening'))
    w.emit('copilotTranscript', line('a', 'you', 'Tell me about a time you led a team?', false))
    await w.answer('answer')
    expect(of('copilotQuestion')).toHaveLength(1)
    expect(of('copilotSuggestion')).toHaveLength(2)
    w.emit('copilotTranscript', line('a', 'you', 'Tell me about a time you led a team?', true))
    await new Promise(r => setTimeout(r, 10))
    expect(of('copilotQuestion')).toHaveLength(1)
  })

  it('hotkey actions drive the engine', async () => {
    const { w, actions, of } = setup()
    w.emit('copilotState', state('listening'))
    w.emit('copilotTranscript', line('a', 'you', 'Walk me through your resume?'))
    await vi.waitFor(() => expect(of('copilotQuestion')).toHaveLength(1))
    actions[0]!('answer')
    await vi.waitFor(() => expect(of('copilotSuggestion')).toHaveLength(2))
  })

  it('an engine failure is surfaced as an engine error, not thrown', async () => {
    const failing: AnswerEngine = { answer: async function* () { throw new Error('Add your OpenRouter key in Settings first') }, cancelAll: vi.fn() }
    const { w, of } = setup({}, failing)
    w.emit('copilotState', state('listening'))
    w.emit('copilotTranscript', line('a', 'you', 'Why should we hire you?'))
    await vi.waitFor(() => expect(of('copilotQuestion')).toHaveLength(1))
    await w.answer('answer')
    expect(of('copilotError')).toEqual([{ kind: 'engine', message: 'Add your OpenRouter key in Settings first', retrying: false }])
  })

  it('end of a candidate turn feeds the practice runner one merged line', async () => {
    const { w, feed } = setup()
    w.emit('copilotState', state('listening', 'practice'))
    w.emit('copilotTranscript', line('a', 'you', 'First part.'))
    w.emit('copilotTranscript', line('b', 'you', 'Second part.'))
    w.endOfTurn('you')
    await Promise.resolve()
    expect(feed).toHaveBeenCalledTimes(1)
    expect(feed).toHaveBeenCalledWith(expect.objectContaining({ speaker: 'you', text: 'First part. Second part.', final: true }), true)
    w.endOfTurn('you') // nothing new said
    expect(feed).toHaveBeenCalledTimes(1)
  })

  it('a new session clears the previous one’s lines and questions', async () => {
    const { w, of } = setup()
    w.emit('copilotState', state('listening'))
    w.emit('copilotTranscript', line('a', 'you', 'Why this role?'))
    await vi.waitFor(() => expect(of('copilotQuestion')).toHaveLength(1))
    w.emit('copilotState', state('stopped'))
    w.emit('copilotState', state('armed'))
    await w.answer('answer')
    expect(of('copilotError')).toHaveLength(1)
  })
})

describe('pre-warm and trace marks (PERF-1)', () => {
  it('warms the connection when a session arms, keeps it warm while listening, and stops on stop', async () => {
    vi.useFakeTimers()
    try {
      const warm = vi.fn(async () => undefined)
      const eng: AnswerEngine = { answer: async function* () { /* none */ }, cancelAll: vi.fn(), warm }
      const { w } = setup({ warmEveryMs: 1000 }, eng)
      w.emit('copilotState', state('armed'))
      expect(warm).toHaveBeenCalledTimes(1)
      await vi.advanceTimersByTimeAsync(2500)
      expect(warm).toHaveBeenCalledTimes(3)
      w.emit('copilotState', state('stopped'))
      await vi.advanceTimersByTimeAsync(5000)
      expect(warm).toHaveBeenCalledTimes(3)
    } finally { vi.useRealTimers() }
  })
  it('auto-ask passes speech-end, STT-final and detector times to the engine', async () => {
    const seen: unknown[] = []
    const eng: AnswerEngine = { answer: async function* (req) { seen.push(req.marks); yield suggestion(req.question.id, true) }, cancelAll: vi.fn() }
    const { w, cfg, of } = setup({}, eng)
    cfg.engine.autoAnswer = true
    w.emit('copilotState', state('listening'))
    w.emit('copilotTranscript', line('a', 'you', 'What is your biggest weakness?'))
    await vi.waitFor(() => expect(of('copilotSuggestion')).toHaveLength(1))
    expect(seen[0]).toEqual({ speechEndAt: 1, sttFinalAt: 1000, detectedAt: 1000 })
  })
})
