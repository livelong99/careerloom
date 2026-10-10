import { afterEach, describe, expect, it, vi } from 'vitest'

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

  describe('practice: the interviewer waits for a finished answer', () => {
    const LONG = 'We split the monolith into twelve services over two quarters.'
    const answers = (feed: ReturnType<typeof setup>['feed']) => feed.mock.calls.filter(c => (c as unknown[])[1] === true).map(c => ((c as unknown[])[0] as TranscriptLine).text)
    function practice(over: Partial<WiringDeps> = {}) {
      vi.useFakeTimers()
      const s = setup({ now: Date.now, ...over })
      s.w.emit('copilotState', state('listening', 'practice'))
      return s
    }
    afterEach(() => vi.useRealTimers())

    it('a turn end hands the merged answer over after a short quiet, once', async () => {
      const { w, feed } = practice()
      w.emit('copilotTranscript', line('a', 'you', 'First part of it.'))
      w.emit('copilotTranscript', line('b', 'you', LONG))
      expect(feed).toHaveBeenCalledWith(expect.objectContaining({ id: 'a' }), false) // activity: the soft answer timer starts over
      w.endOfTurn('you')
      await vi.advanceTimersByTimeAsync(2_400)
      expect(answers(feed)).toEqual([])
      await vi.advanceTimersByTimeAsync(200)
      expect(answers(feed)).toEqual([`First part of it. ${LONG}`])
      w.endOfTurn('you') // nothing new said
      await vi.advanceTimersByTimeAsync(20_000)
      expect(answers(feed)).toHaveLength(1)
    })
    it('speaking again holds the answer open and joins it into one', async () => {
      const { w, feed } = practice()
      w.emit('copilotTranscript', line('a', 'you', LONG))
      w.endOfTurn('you')
      await vi.advanceTimersByTimeAsync(2_000)
      w.emit('copilotTranscript', line('b', 'you', 'And then', false)) // a thinking pause, then more
      await vi.advanceTimersByTimeAsync(5_000)
      expect(answers(feed)).toEqual([])
      w.emit('copilotTranscript', line('b', 'you', 'And then we cut costs by a third.'))
      w.endOfTurn('you')
      await vi.advanceTimersByTimeAsync(2_500)
      expect(answers(feed)).toEqual([`${LONG} And then we cut costs by a third.`])
    })
    it('a short start waits longer; fillers alone never end the answer', async () => {
      const { w, feed } = practice()
      w.emit('copilotTranscript', line('a', 'you', 'Thank you.'))
      w.endOfTurn('you')
      await vi.advanceTimersByTimeAsync(60_000)
      expect(answers(feed)).toEqual([])
      w.emit('copilotTranscript', line('b', 'you', "So, um, I'm going to"))
      w.endOfTurn('you') // six words, but only three carry content
      await vi.advanceTimersByTimeAsync(9_000)
      expect(answers(feed)).toEqual([])
      await vi.advanceTimersByTimeAsync(1_100)
      expect(answers(feed)).toEqual(["Thank you. So, um, I'm going to"])
    })
    it('asking for a suggestion after a short start holds the answer until the next turn end', async () => {
      const { w, feed } = practice()
      await w.interviewerAsked({ id: 'q1', text: 'Tell me about a migration you led.', type: 'behavioural', confidence: 1, at: 1, auto: false })
      w.emit('copilotTranscript', line('a', 'you', 'Let me think.'))
      w.endOfTurn('you')
      await w.answer('answer')
      await vi.advanceTimersByTimeAsync(60_000)
      expect(answers(feed)).toEqual([])
      w.emit('copilotTranscript', line('b', 'you', LONG))
      w.endOfTurn('you')
      await vi.advanceTimersByTimeAsync(2_500)
      expect(answers(feed)).toEqual([`Let me think. ${LONG}`])
    })
    it('asking for more detail after a finished answer waits a little longer, then still hands it over', async () => {
      const { w, feed } = practice()
      await w.interviewerAsked({ id: 'q1', text: 'Tell me about a migration you led.', type: 'behavioural', confidence: 1, at: 1, auto: false })
      w.emit('copilotTranscript', line('a', 'you', LONG))
      w.endOfTurn('you')
      await w.answer('detail')
      await vi.advanceTimersByTimeAsync(9_000)
      expect(answers(feed)).toEqual([])
      await vi.advanceTimersByTimeAsync(1_100)
      expect(answers(feed)).toEqual([LONG])
    })
    it("Clear stops the answer but keeps the interviewer's question: the next press answers it", async () => {
      const { w, actions, of } = practice()
      await w.interviewerAsked({ id: 'q1', text: 'Tell me about a migration you led.', type: 'behavioural', confidence: 1, at: 1, auto: false })
      actions.forEach(a => a('clear'))
      await w.answer('answer')
      expect(of('copilotError')).toEqual([])
      expect(of('copilotSuggestion').map(s => (s as Suggestion).questionId)).toEqual(['q1', 'q1'])
    })
    it('an answer in any script is handed over (Hindi words, Chinese characters)', async () => {
      const { w, feed } = practice()
      w.emit('copilotTranscript', line('a', 'you', 'मैंने चालीस सेवाओं को दो तिमाहियों में कुबेरनेटीस पर ले जाकर रिलीज़ साप्ताहिक रखीं।'))
      w.endOfTurn('you')
      await vi.advanceTimersByTimeAsync(2_500)
      w.emit('copilotTranscript', line('b', 'you', '我负责把四十个服务迁移到新平台。'))
      w.endOfTurn('you')
      await vi.advanceTimersByTimeAsync(2_500)
      expect(answers(feed)).toHaveLength(2)
    })
    it('the candidate talking again (voice, no text yet) holds the answer, but not forever', async () => {
      let talking = true
      const { w, feed } = practice({ speaking: () => talking })
      w.emit('copilotTranscript', line('a', 'you', LONG))
      w.endOfTurn('you')
      await vi.advanceTimersByTimeAsync(30_000) // a long stretch: recognition sends no text in the middle of it
      expect(answers(feed)).toEqual([])
      talking = false
      await vi.advanceTimersByTimeAsync(2_500)
      expect(answers(feed)).toEqual([LONG])
      talking = true // a noisy room: voice activity with no words
      w.emit('copilotTranscript', line('b', 'you', LONG))
      w.endOfTurn('you')
      await vi.advanceTimersByTimeAsync(50_000)
      expect(answers(feed)).toHaveLength(2)
    })
    it('speech after a turn end with no new turn end (an empty final) still ends the answer after a quiet spell', async () => {
      const { w, feed } = practice()
      w.emit('copilotTranscript', line('a', 'you', LONG))
      w.endOfTurn('you')
      w.emit('copilotTranscript', line('b', 'you', 'mm', false))
      await vi.advanceTimersByTimeAsync(9_000)
      expect(answers(feed)).toEqual([])
      await vi.advanceTimersByTimeAsync(1_100)
      expect(answers(feed)).toEqual([LONG])
    })
    it('a session that stops (or a new one) drops a pending answer', async () => {
      const { w, feed } = practice()
      w.emit('copilotTranscript', line('a', 'you', LONG))
      w.endOfTurn('you')
      w.emit('copilotState', state('stopped', 'practice'))
      await vi.advanceTimersByTimeAsync(20_000)
      w.emit('copilotState', state('armed', 'practice'))
      w.emit('copilotTranscript', line('b', 'you', LONG))
      w.endOfTurn('you')
      w.emit('copilotState', state('armed', 'practice'))
      await vi.advanceTimersByTimeAsync(20_000)
      expect(answers(feed)).toEqual([])
    })
    it('words said before the next question never become its answer', async () => {
      const { w, feed } = practice()
      w.emit('copilotTranscript', line('a', 'you', 'Let me think about that one.'))
      w.endOfTurn('you')
      await w.interviewerAsked({ id: 'q2', text: 'Why this company?', type: 'other', confidence: 1, at: 2, auto: false })
      await vi.advanceTimersByTimeAsync(60_000)
      expect(answers(feed)).toEqual([])
      w.emit('copilotTranscript', line('b', 'you', LONG))
      w.endOfTurn('you')
      await vi.advanceTimersByTimeAsync(2_500)
      expect(answers(feed)).toEqual([LONG])
    })
  })

  it('live: a turn end goes straight to the practice seam (no practice runs, so nothing waits)', async () => {
    const { w, feed } = setup()
    w.emit('copilotState', state('listening', 'live'))
    w.emit('copilotTranscript', line('a', 'you', 'First part.'))
    w.endOfTurn('you')
    expect(feed).toHaveBeenCalledTimes(1)
    expect(feed).toHaveBeenCalledWith(expect.objectContaining({ speaker: 'you', text: 'First part.', final: true }), true)
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
    w.emit('copilotState', { ...state('listening'), sources: ['mic', 'system'] })
    w.emit('copilotTranscript', line('a', 'interviewer', 'What is your biggest weakness?'))
    await vi.waitFor(() => expect(of('copilotSuggestion')).toHaveLength(1))
    expect(seen[0]).toEqual({ speechEndAt: 1, sttFinalAt: 1000, detectedAt: 1000 })
  })

  describe('turn info and speculation in the trace (PERF-2)', () => {
    const capture = () => {
      const reqs: Array<{ marks?: Record<string, number>; info?: Record<string, unknown> }> = []
      const engine: AnswerEngine = { cancelAll: vi.fn(), answer: req => { reqs.push({ marks: req.marks as never, info: req.info as never }); return (async function* () { yield suggestion(req.question.id, true) })() } }
      return { engine, reqs }
    }
    const live = (): CopilotEvents['copilotState'] => ({ ...state('listening'), sources: ['mic', 'system'] })

    it('an auto-ask turn carries kind, tier, gate and no speculation', async () => {
      const { engine, reqs } = capture()
      const { w, cfg, of } = setup({}, engine)
      cfg.engine.autoAnswer = true
      w.emit('copilotState', live())
      w.emit('copilotTranscript', line('a', 'interviewer', 'Design a URL shortener.'))
      await vi.waitFor(() => expect(of('copilotSuggestion')).toHaveLength(1))
      expect(reqs[0]!.info).toEqual({ kind: 'system-design', tier: 'deep', auto: true, spec: null, gate: 'heuristic', gateMs: null })
    })

    it('a speculative hit fills the early request’s marks (speech end, STT final, detector, release) and says hit', async () => {
      const { engine, reqs } = capture()
      const { w, cfg, of } = setup({}, engine)
      cfg.engine.autoAnswer = true; cfg.engine.speculativeStart = true
      w.emit('copilotState', live())
      w.emit('copilotTranscript', line('a', 'interviewer', 'Why do you want to work here?', false))
      w.emit('copilotTranscript', line('a', 'interviewer', 'Why do you want to work here?', true))
      await vi.waitFor(() => expect(of('copilotSuggestion')).toHaveLength(1))
      expect(reqs).toHaveLength(1)
      expect(reqs[0]!.marks).toMatchObject({ speechEndAt: 1, sttFinalAt: 1000, detectedAt: 1000, releasedAt: 1000 })
      expect(reqs[0]!.info).toMatchObject({ spec: 'hit', auto: true, kind: 'behavioural' })
    })

    it('after a miss the restarted request is labelled miss', async () => {
      const { engine, reqs } = capture()
      const { w, cfg, of } = setup({}, engine)
      cfg.engine.autoAnswer = true; cfg.engine.speculativeStart = true
      w.emit('copilotState', live())
      w.emit('copilotTranscript', line('a', 'interviewer', 'Tell me about a time.', false))
      w.emit('copilotTranscript', line('a', 'interviewer', 'Tell me about a time you led a migration across three teams?', true))
      await vi.waitFor(() => expect(of('copilotSuggestion').length).toBeGreaterThan(0))
      expect(reqs.at(-1)!.info).toMatchObject({ spec: 'miss', auto: true })
    })
  })

  it('the Clear action aborts the answer, forgets the unanswered question and tells the overlay', async () => {
    const { w, actions, of, cancelAll } = setup()
    w.emit('copilotState', state('listening'))
    w.emit('copilotTranscript', line('a', 'you', 'What are the algorithms used in graph?'))
    await vi.waitFor(() => expect(of('copilotQuestion')).toHaveLength(1))
    actions.forEach(a => a('clear'))
    expect(cancelAll).toHaveBeenCalled()
    expect(of('copilotCleared')).toHaveLength(1)
    actions.forEach(a => a('answer')) // nothing left to answer: the cleared line is not picked up again
    await vi.waitFor(() => expect(of('copilotError').length).toBeGreaterThan(0))
    expect(of('copilotSuggestion')).toHaveLength(0)
  })
})
