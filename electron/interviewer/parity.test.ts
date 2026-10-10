// @vitest-environment node
// Golden event trace: the same question yields the same cues and suggestions whether it is heard live or asked by the AI interviewer.
import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_CONFIG } from '../copilot/config'
import { createDetector } from '../copilot/detector'
import type { AnswerEngine, AnswerRequest } from '../copilot/engine'
import { createLiveWiring } from '../copilot/live-wiring'
import type { CopilotEvents, DetectedQuestion, Suggestion, TranscriptLine } from '../copilot/types'
import { GOLDEN_POOL } from './fixtures/golden-kb'
import { createPracticeRunner } from '../copilot/practice'
import { createInterviewerRunner } from './runner'

const TEXT = 'Tell me about a time you led a team through a hard project?'
const line = (id: string, speaker: TranscriptLine['speaker'], text: string): TranscriptLine => ({ id, speaker, text, final: true, t0: 0, t1: 1 })

function rig(mode: 'live' | 'practice', auto = true) {
  const published: Array<[string, unknown]> = []
  const requests: AnswerRequest[] = []
  const engine: AnswerEngine = {
    answer: async function* (req) {
      requests.push(req)
      for (const done of [false, true]) yield { questionId: req.question.id, model: 'm', tier: req.route?.tier ?? 'fast', say: `say:${req.question.text}`, bullets: ['b1'], star: null, proof: [], flags: [], done, firstTokenMs: 1, totalMs: done ? 2 : null, costUsd: 0 } as Suggestion
    },
    cancelAll: vi.fn(),
  }
  const cfg = structuredClone(DEFAULT_CONFIG)
  cfg.engine.autoAnswer = auto
  const w = createLiveWiring({
    host: { publishState: () => undefined, publish: (n, p) => void published.push([n, p]), setSessionHooks: () => undefined, onAction: () => undefined },
    recorder: { line: () => undefined, question: () => undefined, suggestion: () => undefined },
    feed: async () => undefined, engine, detector: createDetector({ now: () => 0 }), config: () => cfg, now: () => 1000, onStopped: () => undefined,
  })
  const state = (s: CopilotEvents['copilotState']['state']): void => w.emit('copilotState', { state: s, mode, sessionId: 'S', sources: mode === 'live' ? ['mic', 'system'] : ['mic'], startedAt: 1 })
  state('armed'); state('listening')
  const of = <T>(n: string): T[] => published.filter(p => p[0] === n).map(p => p[1] as T)
  return { w, of, requests }
}

/** What the user and the engine see, minus ids and timing. */
const trace = (r: ReturnType<typeof rig>) => ({
  questions: r.of<DetectedQuestion>('copilotQuestion').map(q => ({ text: q.text, auto: q.auto })),
  suggestions: r.of<Suggestion>('copilotSuggestion').map(s => ({ say: s.say, bullets: s.bullets, tier: s.tier, done: s.done })),
  asks: r.requests.map(q => ({ kind: q.kind, text: q.question.text, tier: q.route?.tier, kindRoute: q.route?.kind, transcript: q.transcript.map(l => `${l.speaker}:${l.text}`) })),
})

describe('cue and suggestion parity (golden event trace)', () => {
  it('a question asked by the AI interviewer produces the same trace as the same question heard live', async () => {
    const live = rig('live')
    live.w.emit('copilotTranscript', line('l1', 'interviewer', TEXT))
    await vi.waitFor(() => expect(live.of('copilotSuggestion')).toHaveLength(2))

    const practice = rig('practice')
    const item = { ...GOLDEN_POOL[1]!, text: TEXT } // a KB behavioural question with the live question's wording
    const runner = createInterviewerRunner({
      plan: { mode: 'behavioural', minutes: 15, focusSkills: [], difficulty: 'adaptive', includeGenerated: true, persona: { style: 's', seniority: 'senior', strictness: 3, name: 'A' }, voice: { engine: 'system', voiceId: 'x', speed: 1 }, echo: 'speakers' },
      sessionId: 'S', pool: [item], answerMs: 60_000,
      sink: { line: l => practice.w.emit('copilotTranscript', l), question: q => void practice.w.interviewerAsked(q), done: () => undefined },
    })
    runner.start() // warm-up, skipped below
    await runner.feed(line('y1', 'you', 'Hi, I am ready'), true)
    await vi.waitFor(() => expect(practice.of('copilotSuggestion').length).toBeGreaterThanOrEqual(4)) // warm-up + question
    runner.stop()

    const l = trace(live), p = trace(practice)
    const asked = p.questions.findIndex(q => q.text === TEXT)
    expect(asked).toBeGreaterThanOrEqual(0)
    expect(p.questions[asked]).toEqual(l.questions[0])
    const mine = p.suggestions.filter(s => s.say === `say:${TEXT}`)
    expect(mine).toEqual(l.suggestions)
    const ask = p.asks.find(a => a.text === TEXT)!
    expect(ask).toEqual({ ...l.asks[0]!, transcript: ask.transcript }) // same route, tier and kind
    expect(ask.transcript.at(-1)).toBe(`interviewer:${TEXT}`) // the engine saw the question as the last interviewer line, as in live
    expect(l.asks[0]!.transcript.at(-1)).toBe(`interviewer:${TEXT}`)
  })

  it('a report question asked by the mock interviewer is what the Answer hotkey answers', async () => {
    const r = rig('practice', false)
    const runner = createPracticeRunner({
      questions: [{ id: 'q-1', text: TEXT, type: 'behavioural', source: 'report', lastScore: null }], followups: false, answerMs: 60_000,
      sink: { line: l => r.w.emit('copilotTranscript', l), question: q => void r.w.interviewerAsked(q), done: () => undefined },
    })
    runner.start()
    await r.w.answer('answer')
    runner.stop()
    expect(r.of('copilotError')).toEqual([])
    expect(r.requests.map(q => q.question.text)).toEqual([TEXT])
    expect(r.requests[0]!.transcript.at(-1)).toEqual(expect.objectContaining({ speaker: 'interviewer', text: TEXT }))
  })

  it('with autoAnswer off the question shows and the hotkey answers it, as in live', async () => {
    const r = rig('practice', false)
    await r.w.interviewerAsked({ id: 'x', text: TEXT, type: 'behavioural', confidence: 1, at: 1, auto: false })
    expect(r.of('copilotQuestion')).toHaveLength(1)
    expect(r.of('copilotSuggestion')).toHaveLength(0)
    await r.w.answer('answer')
    expect(r.of('copilotSuggestion')).toHaveLength(2)
  })
})
