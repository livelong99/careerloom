// Interviewer runner: the PracticeRunner interface driven by the job knowledge base (plan §3.3, §6). Pure: the LLM, the speaker
// (TTS, WP5) and the sink are injected, so it runs on a scripted model and the golden KB.
import { createHash } from 'node:crypto'

import type { PracticeRunner, PracticeSink } from '../copilot/practice'
import type { QuestionType, TranscriptLine } from '../copilot/types'
import type { KbItem, KbQuestionType, SkillNode } from '../kb/types'
import { decideProbe, MAX_PROBES, probeText } from './probe'
import { nextStats, scoreAnswer } from './score'
import { nextDifficulty, questionBudget, selectNext } from './select'
import type { InterviewPlan, InterviewerPhase, InterviewerState, QuestionResult } from './types'

/** WP5 fills this with the TTS service; until then the default is silent and instant. */
export type Speaker = { say(text: string, questionId: string): Promise<void> | void; cancel(): void }
export const noopSpeaker: Speaker = { say: () => undefined, cancel: () => undefined }
export type SpeakState = 'speaking' | 'thinking' | 'listening' | 'idle'

export type InterviewerOptions = {
  plan: InterviewPlan; sessionId: string; pool: KbItem[]; skills?: SkillNode[]; recent?: ReadonlySet<string>
  sink: PracticeSink
  /** Text in, text out; used for probes and scoring. Absent = no probes and unscored answers. */
  complete?: (system: string, user: string) => Promise<string>
  speak?: Speaker; answerMs: number; now?: () => number
  onState?(s: { state: SpeakState; questionId: string | null }): void
  onResult?(r: QuestionResult, item: KbItem, stats: KbItem['stats']): void
}
export type InterviewerRunner = PracticeRunner & {
  /** Re-speak the current question. */ replay(): void
  /** Record the current question as skipped and move on. */ skip(): void
  /** Reveal the next rubric cue (recorded as hint use); null when there is none. */ hint(): string | null
  results(): QuestionResult[]
  state(): InterviewerState
}

export const WARMUPS = [
  'Thanks for making the time. To start, tell me a little about yourself and what draws you to this role.',
  'Welcome. Before we dig in, what are you working on at the moment and what made you look at this job?',
  'Good to meet you. Give me a quick overview of your background and what you are hoping to do next.',
]
export const CLOSING = 'That covers my questions. Do you have any questions for me?'
export const WRAP_UP = 'Thank you, that is everything from me. Good luck with the real thing.'

const TYPE: Record<KbQuestionType, QuestionType> = { behavioural: 'behavioural', situational: 'behavioural', technical: 'technical', coding: 'coding', 'system-design': 'system-design', recruiter: 'other' }
const rand = (seed: string): (() => number) => { let i = 0; return () => parseInt(createHash('sha1').update(`${seed}|${i++}`).digest('hex').slice(0, 6), 16) / 0xffffff }

export function createInterviewerRunner(o: InterviewerOptions): InterviewerRunner {
  const now = o.now ?? Date.now
  const speak = o.speak ?? noopSpeaker
  const { plan } = o
  const draw = rand(o.sessionId)
  const budget = questionBudget(plan.minutes)
  let st: InterviewerState = { sessionId: o.sessionId, seed: o.sessionId, phase: 'warmup', asked: [], probes: 0, difficulty: 3, startedAt: now(), mix: {} }
  const set = (p: Partial<InterviewerState>): void => { st = { ...st, ...p } }
  const results: QuestionResult[] = []
  const scores: number[] = []
  let current: { id: string; item: KbItem | null; text: string } | null = null
  let answer: string[] = []
  let hintUsed = false
  let hintIdx = 0
  let stopped = false
  let busy = false
  let timer: ReturnType<typeof setTimeout> | null = null
  let epoch = 0 // bumps on every question so a late speak() or timer from an earlier one is ignored

  const state = (s: SpeakState): void => o.onState?.({ state: s, questionId: current?.id ?? null })
  const clear = (): void => { if (timer) { clearTimeout(timer); timer = null } }
  const arm = (): void => { clear(); timer = setTimeout(() => { void advance() }, o.answerMs) }

  async function ask(id: string, text: string, type: QuestionType, item: KbItem | null): Promise<void> {
    const mine = ++epoch
    current = { id, item, text }
    const at = now()
    // Line first, then the question: the order a heard question arrives in live, so the engine sees it in the transcript.
    o.sink.line({ id: `ask-${id}`, speaker: 'interviewer', text, final: true, t0: at, t1: at })
    o.sink.question({ id, text, type, confidence: 1, at, auto: false })
    state('speaking')
    try { await speak.say(text, id) } catch { /* a failing voice never stops the interview: captions already went out */ }
    if (stopped || mine !== epoch) return
    state('listening')
    arm()
  }

  const phase = (p: InterviewerPhase): void => set({ phase: p })

  function next(): void {
    answer = []; hintUsed = false; hintIdx = 0; set({ probes: 0 })
    if (st.phase === 'warmup') {
      phase('questions')
      void ask('warmup', WARMUPS[Math.floor(draw() * WARMUPS.length)]!, 'other', null); return
    }
    const overTime = plan.minutes !== null && now() - st.startedAt >= plan.minutes * 60_000
    const it = st.phase === 'questions' && st.asked.length < budget && !overTime ? selectNext(o.pool, plan, st, { skills: o.skills, recent: o.recent }) : null
    if (it) {
      set({ asked: [...st.asked, it.id], mix: { ...st.mix, [it.type]: (st.mix[it.type] ?? 0) + 1 } })
      void ask(it.id, it.text, TYPE[it.type], it); return
    }
    if (st.phase === 'questions') { phase('closing'); void ask('closing', CLOSING, 'other', null); return }
    finish()
  }

  function finish(): void {
    clear(); phase('done'); stopped = true; current = null
    o.sink.line({ id: 'ask-wrap-up', speaker: 'interviewer', text: WRAP_UP, final: true, t0: now(), t1: now() })
    state('idle')
    o.sink.done()
  }

  async function record(skipped: boolean): Promise<void> {
    const c = current
    if (!c?.item) return
    const text = answer.join(' ')
    const r = skipped ? { itemId: c.item.id, score: null, criteria: [], hintUsed, skipped: true } : o.complete ? await scoreAnswer(c.item, text, o.complete, hintUsed) : { itemId: c.item.id, score: null, criteria: [], hintUsed, skipped: text.trim() === '' }
    results.push(r)
    if (r.score !== null) { scores.push(r.score); set({ difficulty: plan.difficulty === 'adaptive' ? nextDifficulty(st.difficulty, scores) : st.difficulty }) }
    o.onResult?.(r, c.item, nextStats(c.item.stats, r.score))
  }

  async function advance(skip = false): Promise<void> {
    if (stopped || busy || !current) return
    busy = true; clear(); speak.cancel()
    const mine = epoch
    try {
      state('thinking')
      const text = answer.join(' ')
      if (!skip && current.item && o.complete && st.probes < MAX_PROBES) {
        const d = await decideProbe(text, plan, st.probes, o.complete, draw)
        if (stopped || mine !== epoch) return
        if (d.probe && d.weakest) { set({ probes: st.probes + 1 }); void ask(`${current.item.id}-p${st.probes}`, probeText(d.weakest), TYPE[current.item.type], current.item); return }
      }
      await record(skip)
      if (stopped || mine !== epoch) return
      if (current.id === 'closing') return finish()
      next()
    } finally { busy = false }
  }

  return {
    start() { if (st.phase === 'warmup' && !current) next() },
    async feed(line: TranscriptLine, endOfTurn: boolean) {
      if (stopped || line.speaker !== 'you' || !current) return
      if (!endOfTurn) { if (timer) arm(); return } // still talking: the soft timer never cuts an answer off
      o.sink.line(line); answer.push(line.text); await advance()
    },
    stop() { stopped = true; clear(); speak.cancel(); state('idle') },
    replay() {
      if (!current || stopped || busy) return
      const mine = ++epoch
      clear(); speak.cancel(); state('speaking')
      void Promise.resolve(speak.say(current.text, current.id)).catch(() => undefined).then(() => { if (!stopped && mine === epoch) { state('listening'); arm() } })
    },
    skip() { void advance(true) },
    hint() {
      const row = current?.item?.rubric[hintIdx]
      if (!row || stopped) return null
      hintIdx += 1; hintUsed = true
      const text = `Hint: a good answer shows ${row.criterion.toLowerCase()}, e.g. ${row.good}.`
      o.sink.line({ id: `hint-${current!.id}-${hintIdx}`, speaker: 'interviewer', text, final: true, t0: now(), t1: now() })
      return text
    },
    results: () => [...results],
    state: () => st,
  }
}
