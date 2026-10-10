// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'

import type { DetectedQuestion, TranscriptLine } from '../copilot/types'
import { GOLDEN_POOL, GOLDEN_SKILLS } from './fixtures/golden-kb'
import { scripted, type Script } from './fixtures/scripted-llm'
import { CLOSING, createInterviewerRunner, type InterviewerOptions, type Speaker } from './runner'
import { questionBudget } from './select'
import type { InterviewPlan } from './types'

const plan = (over: Partial<InterviewPlan> = {}): InterviewPlan => ({
  mode: 'mixed', minutes: 30, focusSkills: [], difficulty: 'adaptive', includeGenerated: true,
  persona: { style: 'friendly', seniority: 'senior', strictness: 5, name: 'Asha' }, voice: { engine: 'system', voiceId: 'x', speed: 1 }, echo: 'speakers', ...over,
})
const checklist = (o: Record<string, boolean> = {}) => JSON.stringify({ result: true, metric: true, ownership: true, tradeoff: true, example: true, situation: true, action: true, task: true, ...o })
const scoreJson = (n: number) => JSON.stringify({ criteria: [{ criterion: 'Clear ownership', score: n, evidence: '' }, { criterion: 'Structure', score: n, evidence: '' }] })
const llm = (probeAll = false, score = 3, extra: Script = []) => scripted([...extra, { when: /Check an interview answer/, reply: checklist(probeAll ? { metric: false } : {}) }, { when: /score one spoken/i, reply: scoreJson(score) }])

const you = (text: string, i = 0): TranscriptLine => ({ id: `y${i}`, speaker: 'you', text, final: true, t0: 1, t1: 2 })

function setup(over: Partial<InterviewerOptions> = {}, p: InterviewPlan = plan()) {
  const questions: DetectedQuestion[] = []
  const lines: TranscriptLine[] = []
  const done = vi.fn()
  const states: Array<[string, string | null]> = []
  const r = createInterviewerRunner({
    plan: p, sessionId: 'sess-1', pool: GOLDEN_POOL, skills: GOLDEN_SKILLS, answerMs: 60_000, now: () => 1000,
    sink: { question: q => void questions.push(q), line: l => void lines.push(l), done }, complete: llm(),
    onState: s => void states.push([s.state, s.questionId]), ...over,
  })
  /** Answers the current question and waits for the next one to be asked. */
  const answer = async (text = 'I led it and we shipped it'): Promise<void> => { const n = questions.length; await r.feed(you(text, n), true); await vi.waitFor(() => expect(questions.length).toBeGreaterThan(n)) }
  return { r, questions, lines, done, states, answer }
}
afterEach(() => vi.useRealTimers())

describe('interviewer runner', () => {
  it('the candidate still talking restarts the soft answer timer, so it never cuts an answer off', async () => {
    vi.useFakeTimers()
    const { r, questions } = setup()
    r.start(); await vi.advanceTimersByTimeAsync(0) // warm-up asked, listening
    await vi.advanceTimersByTimeAsync(50_000)
    await r.feed({ ...you('So the first thing', 1), final: false }, false)
    await vi.advanceTimersByTimeAsync(50_000)
    expect(questions).toHaveLength(1)
    await vi.advanceTimersByTimeAsync(10_001)
    await vi.waitFor(() => expect(questions).toHaveLength(2))
  })
  it('replay says the question again as speaking, then listens; a replay that was replaced never flips the state', async () => {
    let finish: Array<() => void> = []
    const speak: Speaker = { say: () => new Promise<void>(res => { finish.push(res) }), cancel: () => { const f = finish; finish = []; f.forEach(x => x()) } }
    const { r, states } = setup({ speak })
    r.start(); finish.shift()!(); await Promise.resolve(); await Promise.resolve()
    expect(states.at(-1)![0]).toBe('listening')
    r.replay(); r.replay() // the second replaces the first
    await Promise.resolve(); await Promise.resolve()
    expect(states.at(-1)![0]).toBe('speaking')
    finish.shift()!(); await Promise.resolve(); await Promise.resolve()
    expect(states.at(-1)![0]).toBe('listening')
  })
  it('opens with a warm-up, then KB questions, then closes and wraps up', async () => {
    const { r, questions, lines, done, answer } = setup({ complete: llm(false) }, plan({ minutes: 8 })) // budget 2
    r.start()
    expect(questions[0]!.id).toBe('warmup')
    await answer(); await answer()
    expect(questions.map(q => q.id).slice(1).every(id => !id.startsWith('warmup'))).toBe(true)
    await answer()
    expect(questions.at(-1)!.text).toBe(CLOSING)
    await r.feed(you('No questions, thank you', 99), true)
    expect(done).toHaveBeenCalledTimes(1)
    expect(lines.at(-1)!.speaker).toBe('interviewer')
  })

  it('a 30-minute mixed loop asks the expected 3:4:1 mix, never repeats, never hidden', async () => {
    const { r, questions, answer } = setup({ complete: llm(false) })
    r.start()
    for (let i = 0; i < questionBudget(30) + 1; i++) await answer()
    const kb = questions.filter(q => !['warmup', 'closing'].includes(q.id))
    expect(kb).toHaveLength(8)
    expect(new Set(kb.map(q => q.id)).size).toBe(8)
    expect(kb.map(q => q.id)).not.toContain('h1')
    const g = (t: string[]) => kb.filter(q => t.includes(q.type)).length
    expect([g(['behavioural']), g(['technical', 'coding']), g(['system-design'])]).toEqual([3, 4, 1])
  })

  it('honours includeGenerated=false and focus skills', async () => {
    const { r, questions, answer } = setup({ complete: llm(false) }, plan({ includeGenerated: false, mode: 'technical', focusSkills: ['sql'], minutes: 15 }))
    r.start()
    for (let i = 0; i < 4; i++) await answer()
    const kb = questions.filter(q => q.id !== 'warmup' && q.id !== 'closing')
    const byId = new Map(GOLDEN_POOL.map(i => [i.id, i]))
    expect(kb.every(q => byId.get(q.id)!.provenance !== 'generated')).toBe(true)
    expect(byId.get(kb[0]!.id)!.skills).toContain('sql')
  })

  it('asks at most 2 probes per question, then moves to the next question', async () => {
    const { r, questions, answer } = setup({ complete: llm(true) })
    r.start(); await answer() // warm-up answered → first KB question
    const first = questions.at(-1)!.id
    await answer(); await answer() // two probes
    const ids = questions.map(q => q.id)
    expect(ids.slice(-2)).toEqual([`${first}-p1`, `${first}-p2`])
    await answer() // third answer: no third probe
    expect(questions.at(-1)!.id).not.toMatch(/-p\d$/)
    expect(questions.at(-1)!.id).not.toBe(first)
  })

  it('scores each question with rubric rows and reports stats write-back', async () => {
    const onResult = vi.fn()
    const { r, answer } = setup({ complete: llm(false, 4), onResult })
    r.start(); await answer(); await answer()
    expect(onResult).toHaveBeenCalledTimes(1)
    const [res, item, stats] = onResult.mock.calls[0]!
    expect(res.score).toBe(4); expect(res.criteria).toHaveLength(2)
    expect(stats).toEqual({ asked: item.stats.asked + 1, lastScore: 4, avgScore: 4 })
    expect(r.results()).toHaveLength(1)
  })

  it('ramps difficulty: two strong answers raise it, two weak lower it', async () => {
    const hi = setup({ complete: llm(false, 5) }); hi.r.start()
    await hi.answer(); await hi.answer(); await hi.answer()
    expect(hi.r.state().difficulty).toBe(4)
    const lo = setup({ complete: llm(false, 1) }); lo.r.start()
    await lo.answer(); await lo.answer(); await lo.answer()
    expect(lo.r.state().difficulty).toBe(2)
  })

  it('works with no model: no probes, unscored results, still finishes', async () => {
    const { r, answer } = setup({ complete: undefined })
    r.start(); await answer(); await answer()
    expect(r.results()[0]!.score).toBeNull()
  })

  it('skip records the question as skipped and moves on', async () => {
    const { r, questions } = setup()
    r.start(); await r.feed(you('hi'), true); await vi.waitFor(() => expect(questions).toHaveLength(2))
    r.skip(); await vi.waitFor(() => expect(questions).toHaveLength(3))
    expect(r.results()[0]).toMatchObject({ skipped: true, score: null })
  })

  it('hint reveals rubric cues one by one and marks hint use', async () => {
    const { r, lines, answer } = setup({ complete: llm(false, 3) })
    r.start(); await answer()
    expect(r.hint()).toMatch(/clear ownership/i)
    expect(r.hint()).toMatch(/concrete result/i)
    expect(lines.filter(l => l.id.startsWith('hint-'))).toHaveLength(2)
    await answer()
    expect(r.results()[0]!.hintUsed).toBe(true)
  })

  it('the speak hook gets every question; replay re-speaks; a failing voice does not stop the session', async () => {
    const say = vi.fn(async () => { throw new Error('tts down') })
    const speak: Speaker = { say, cancel: vi.fn() }
    const { r, questions } = setup({ speak })
    r.start()
    await vi.waitFor(() => expect(say).toHaveBeenCalledTimes(1))
    expect(say).toHaveBeenCalledWith(questions[0]!.text, 'warmup')
    r.replay()
    await vi.waitFor(() => expect(say).toHaveBeenCalledTimes(2))
  })

  it('reports speaking → listening → thinking states', async () => {
    const { r, states, answer } = setup()
    r.start(); await vi.waitFor(() => expect(states.map(s => s[0])).toContain('listening'))
    await answer()
    expect(new Set(states.map(s => s[0]))).toEqual(new Set(['speaking', 'listening', 'thinking']))
  })

  it('a silent candidate times out into a skipped question', async () => {
    vi.useFakeTimers()
    const { r, questions } = setup({ answerMs: 1000 })
    r.start()
    await vi.advanceTimersByTimeAsync(1000) // warm-up timer
    await vi.advanceTimersByTimeAsync(1000) // first KB question timer
    expect(questions.length).toBeGreaterThanOrEqual(3)
    expect(r.results()[0]).toMatchObject({ skipped: true })
    r.stop()
  })

  it('stop ends everything and ignores later answers', async () => {
    const { r, questions } = setup()
    r.start(); r.stop()
    await r.feed(you('late'), true)
    expect(questions).toHaveLength(1)
  })

  it('ignores the interviewer’s own lines and partials', async () => {
    const { r, questions } = setup()
    r.start()
    await r.feed({ ...you('x'), speaker: 'interviewer' }, true)
    await r.feed(you('x'), false)
    expect(questions).toHaveLength(1)
  })
})
