// Glue between the session controller (capture + STT), the overlay host, the question detector, the answer engine and the
// session recorder (plan §3). Pure: every collaborator is injected, so the whole live flow is unit-testable with fakes.
import { questionType, type QuestionDetector } from './detector'
import type { AnswerEngine } from './engine'
import type { PromptKind } from './prompts'
import { friendlyLlmError } from './providers/errors'
import { LlmError } from './providers/openrouter'
import type { CopilotConfig, CopilotEvents, CopilotMode, DetectedQuestion, SourceId, Speaker, StopReason, Suggestion, TranscriptLine } from './types'

type Emit = <K extends keyof CopilotEvents>(ev: K, payload: CopilotEvents[K]) => void
export type WiringHost = {
  publishState(s: CopilotEvents['copilotState']): void
  publish: Emit
  setSessionHooks(h: { stopCapture(): Promise<void> | void; abortRequests(): void }): void
  onAction(cb: (a: string) => void): void
}
export type WiringDeps = {
  host: WiringHost
  recorder: { line(l: TranscriptLine): void; question(q: DetectedQuestion): void; suggestion(s: Suggestion): void }
  /** Practice runner input (createCopilot's `feed`). */
  feed(line: TranscriptLine, endOfTurn: boolean): Promise<void>
  engine: AnswerEngine
  detector: QuestionDetector
  config: () => CopilotConfig
  now?: () => number
  /** The capture state reached 'stopped' (panic, tray, hotkey or user): persist and score the session. */
  onStopped(): void
}

const MAX_LINES = 200
const ANSWER_KINDS: ReadonlySet<string> = new Set<PromptKind>(['answer', 'followup', 'clarify', 'summarise'])
const SUMMARISE_PROMPT = 'Summarise the conversation so far'
const msg = (e: unknown): string => (e instanceof Error ? e.message : String(e))
const upsert = (list: TranscriptLine[], l: TranscriptLine): TranscriptLine[] => {
  const i = list.findIndex(x => x.id === l.id)
  const next = i < 0 ? [...list, l] : list.map((x, j) => (j === i ? l : x))
  return next.length > MAX_LINES ? next.slice(-MAX_LINES) : next
}

export function createLiveWiring(d: WiringDeps) {
  const now = d.now ?? Date.now
  let mode: CopilotMode = 'practice'
  let sources: SourceId[] = []
  let lines: TranscriptLine[] = []
  let questions = new Map<string, DetectedQuestion>()
  let lastQuestion: DetectedQuestion | null = null
  let turn: TranscriptLine[] = []
  let manual = 0
  const answeredLines = new Set<string>() // transcript lines already answered on demand: their final is not a new question
  let current: AbortController | null = null

  const reset = (): void => { lines = []; questions = new Map(); lastQuestion = null; turn = []; answeredLines.clear(); current?.abort(); current = null; d.detector.reset() }
  const error = (message: string, extra: { actions?: CopilotEvents['copilotError']['actions']; suggestion?: string } = {}): void => d.host.publish('copilotError', { kind: 'engine', message, retrying: false, ...extra })
  const engineError = (e: unknown): void => {
    if (!(e instanceof LlmError)) return error(msg(e))
    const f = friendlyLlmError(e, { dataCollection: d.config().engine.openrouter.dataCollection })
    error(f.message, { actions: f.actions, ...(f.suggestion ? { suggestion: f.suggestion } : {}) })
  }
  const addQuestion = (q: DetectedQuestion): void => { questions.set(q.id, q); lastQuestion = q; d.recorder.question(q); d.host.publish('copilotQuestion', q) }

  /** Mic-only live has no interviewer channel: the mic hears both sides, so its finals are candidates too (rules filter chatter). */
  const detectable = (l: TranscriptLine): boolean => mode === 'live' && l.final && !answeredLines.has(l.id) && (l.speaker === 'interviewer' || !sources.includes('system'))

  async function detect(l: TranscriptLine): Promise<void> {
    const q = await d.detector.feed({ ...l, speaker: 'interviewer' })
    if (!q) return
    addQuestion(q)
    if (d.config().engine.autoAnswer) await answer('answer', q.id)
  }

  async function answer(kind: PromptKind, questionId?: string): Promise<void> {
    let q = (questionId ? questions.get(questionId) : undefined) ?? lastQuestion
    if (!q) {
      // Flush what is still being said: the key is often pressed before the engine has finalised the question.
      const heard = kind === 'summarise' ? undefined : [...lines].reverse().find(l => l.text.trim() !== '')
      if (!heard && kind !== 'summarise') return error('Nothing to answer yet: no question has been heard')
      const text = heard?.text.trim() ?? SUMMARISE_PROMPT
      if (heard) answeredLines.add(heard.id)
      q = { id: `qm${++manual}`, text, type: questionType(text), confidence: 0.5, at: now(), auto: false }
      addQuestion(q)
    }
    current?.abort()
    const ac = new AbortController()
    current = ac
    try {
      for await (const s of d.engine.answer({ question: q, transcript: lines.filter(l => l.final), kind, signal: ac.signal })) {
        d.recorder.suggestion(s)
        d.host.publish('copilotSuggestion', s)
      }
    } catch (e) { engineError(e) }
  }

  d.host.onAction(a => { if (ANSWER_KINDS.has(a)) void answer(a as PromptKind) })

  const emit: Emit = (ev, payload) => {
    if (ev === 'copilotState') {
      const s = payload as CopilotEvents['copilotState']
      if (s.state === 'armed') reset()
      mode = s.mode; sources = s.sources.length ? s.sources : sources
      d.host.publishState(s)
      if (s.state === 'stopped') d.onStopped()
      return
    }
    if (ev === 'copilotTranscript') {
      const l = payload as TranscriptLine
      lines = upsert(lines, l)
      d.recorder.line(l)
      if (l.final && l.speaker === 'you') turn = [...turn, l]
      if (detectable(l)) void detect(l)
    }
    d.host.publish(ev, payload)
  }

  /** A speaker's turn closed: hand the candidate's finished answer (all finals of the turn, merged) to practice. */
  function endOfTurn(speaker: Speaker): void {
    if (speaker !== 'you' || turn.length === 0) return
    const first = turn[0]!, last = turn[turn.length - 1]!
    const merged: TranscriptLine = { ...last, text: turn.map(l => l.text).join(' '), t0: first.t0 }
    turn = []
    void d.feed(merged, true)
  }

  return {
    emit, endOfTurn, answer,
    /** The session controller arrives after the wiring (it needs `emit`): the kill switch closes over it. */
    bindSession(ctl: { stop(reason: StopReason): Promise<void> }): void {
      d.host.setSessionHooks({ stopCapture: () => ctl.stop('panic'), abortRequests: () => { d.engine.cancelAll(); current?.abort() } })
    },
  }
}
