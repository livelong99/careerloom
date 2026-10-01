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

  it('autoAnswer streams a suggestion for a question heard on the interviewer channel', async () => {
    const { w, of, cfg } = setup()
    cfg.engine.autoAnswer = true
    w.emit('copilotState', { ...state('listening'), sources: ['mic', 'system'] })
    w.emit('copilotTranscript', line('a', 'interviewer', 'What is your biggest weakness?'))
    await vi.waitFor(() => expect(of('copilotSuggestion')).toHaveLength(2))
  })

  it('autoAnswer never fires from mic-only audio (both voices on one channel): the question shows, the hotkey stays', async () => {
    const { w, of, cfg } = setup()
    cfg.engine.autoAnswer = true
    w.emit('copilotState', state('listening'))
    w.emit('copilotTranscript', line('a', 'you', 'What is your biggest weakness?'))
    await vi.waitFor(() => expect(of('copilotQuestion')).toHaveLength(1))
    await new Promise(r => setTimeout(r, 10))
    expect(of('copilotSuggestion')).toHaveLength(0)
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

describe('live wiring: auto-ask, routing and speculative start (PERF-2)', () => {
  const live = (): CopilotEvents['copilotState'] => ({ ...state('listening'), sources: ['mic', 'system'] })
  const recordingEngine = () => {
    const reqs: Array<{ text: string; route?: unknown; aborted: () => boolean }> = []
    const engine: AnswerEngine = {
      cancelAll: vi.fn(),
      answer: req => {
        reqs.push({ text: req.question.text, route: req.route, aborted: () => req.signal.aborted })
        return (async function* () { yield suggestion(req.question.id, false); await new Promise(r => setTimeout(r, 5)); if (req.signal.aborted) return; yield suggestion(req.question.id, true) })()
      },
    }
    return { engine, reqs }
  }

  it('auto-ask passes the routed tier to the engine', async () => {
    const { engine, reqs } = recordingEngine()
    const { w, of, cfg } = setup({}, engine)
    cfg.engine.autoAnswer = true
    w.emit('copilotState', live())
    w.emit('copilotTranscript', line('a', 'interviewer', 'Design a URL shortener.'))
    await vi.waitFor(() => expect(of('copilotSuggestion')).toHaveLength(2))
    expect(reqs[0]!.route).toMatchObject({ kind: 'system-design', tier: 'deep' })
  })

  it('a question still shows when auto-ask is rate limited, but costs nothing', async () => {
    const { engine, reqs } = recordingEngine()
    let t = 0
    const { w, of, cfg } = setup({ now: () => t }, engine)
    cfg.engine.autoAnswer = true
    w.emit('copilotState', live())
    for (let i = 0; i < 3; i++) { t += 500; w.emit('copilotTranscript', line(`l${i}`, 'interviewer', `Tell me about project number ${i}?`)); await new Promise(r => setTimeout(r, 12)) }
    expect(of('copilotQuestion')).toHaveLength(3)
    expect(reqs).toHaveLength(1)
  })

  it('speculative start: a matching final adopts the early request (one engine call, answers carry the final question id)', async () => {
    const { engine, reqs } = recordingEngine()
    const { w, of, cfg } = setup({}, engine)
    cfg.engine.autoAnswer = true; cfg.engine.speculativeStart = true
    w.emit('copilotState', live())
    w.emit('copilotTranscript', line('a', 'interviewer', 'Why do you want to work here?', false))
    w.emit('copilotTranscript', line('a', 'interviewer', 'Why do you want to work here?', true))
    await vi.waitFor(() => expect(of('copilotSuggestion')).toHaveLength(2))
    const qid = (of('copilotQuestion')[0] as { id: string }).id
    expect(reqs).toHaveLength(1)
    expect((of('copilotSuggestion') as Suggestion[]).every(s => s.questionId === qid)).toBe(true)
    expect(w.metrics().speculation).toMatchObject({ started: 1, hits: 1, misses: 0 })
  })

  it('speculative start: a different final aborts the early request and restarts on the real question', async () => {
    const { engine, reqs } = recordingEngine()
    const { w, of, cfg } = setup({}, engine)
    cfg.engine.autoAnswer = true; cfg.engine.speculativeStart = true
    w.emit('copilotState', live())
    w.emit('copilotTranscript', line('a', 'interviewer', 'Tell me about a time.', false))
    w.emit('copilotTranscript', line('a', 'interviewer', 'Tell me about a time you led a migration across three teams?', true))
    await vi.waitFor(() => expect((of('copilotSuggestion') as Suggestion[]).some(s => s.done)).toBe(true))
    expect(reqs.map(r => r.text)).toEqual(['Tell me about a time.', 'Tell me about a time you led a migration across three teams?'])
    expect(reqs[0]!.aborted()).toBe(true)
    expect(w.metrics().speculation).toMatchObject({ started: 1, hits: 0, misses: 1 })
  })

  it('speculation is off by default and mic-only never speculates', async () => {
    const { engine, reqs } = recordingEngine()
    const { w, cfg } = setup({}, engine)
    cfg.engine.autoAnswer = true
    w.emit('copilotState', live())
    w.emit('copilotTranscript', line('a', 'interviewer', 'Why do you want to work here?', false))
    cfg.engine.speculativeStart = true
    w.emit('copilotState', state('listening')) // mic-only
    w.emit('copilotTranscript', line('b', 'you', 'Why do you want to work here?', false))
    expect(reqs).toHaveLength(0)
  })
})

