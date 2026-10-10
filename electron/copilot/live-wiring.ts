// Glue between the session controller (capture + STT), the overlay host, the question detector, the answer engine and the
// session recorder (plan §3). Pure: every collaborator is injected, so the whole live flow is unit-testable with fakes.
import { createAutoAsk } from './auto-ask'
import { continuesQuestion, heuristicHint, questionType, type QuestionDetector } from './detector'
import { checkVision, tierModel, type AnswerEngine } from './engine'
import type { PromptKind } from './prompts'
import { friendlyLlmError } from './providers/errors'
import { debugLog } from '../debug-log'
import { LlmError } from './providers/openrouter'
import { routeQuestion, type Route } from './routing'
import { ScreenshotError, type Shot } from './screenshots'
import { createSpeculator, type SpecRun } from './speculate'
import type { TraceMarks, TurnInfo } from './trace'
import type { CopilotConfig, CopilotEvents, CopilotMode, DetectedQuestion, SourceId, Speaker, StopReason, Suggestion, TranscriptLine } from './types'

type Emit = <K extends keyof CopilotEvents>(ev: K, payload: CopilotEvents[K]) => void
export type WiringHost = {
  publishState(s: CopilotEvents['copilotState']): void
  publish: Emit
  setSessionHooks(h: { stopCapture(): Promise<void> | void; abortRequests(): void }): void
  onAction(cb: (a: string) => void): void
}
/** Screen reading (M3), injected so the flow is testable with fakes. All of it is inert unless `engine.screenshots` is on. */
export type ScreenDeps = {
  /** Hides the overlay, grabs, downsizes; throws ScreenshotError('permission' | 'budget' | 'capture'). */
  capture(): Promise<Pick<Shot, 'jpeg' | 'timings'>>
  /** A frame no older than `maxAgeMs` (the end-of-turn pre-capture), else null. */
  latest(maxAgeMs: number): Pick<Shot, 'jpeg' | 'timings'> | null
  /** Deletes every held frame (session end, panic, new session). */
  clear(): void
  isVision(model: string): boolean
}
type ShotLike = Pick<Shot, 'jpeg' | 'timings'>
type Blocked = NonNullable<CopilotEvents['copilotScreen']['reason']>
const BLOCK_TEXT: Record<Exclude<Blocked, 'no-vision'>, string> = {
  off: 'Screenshots are off. Turn on "Read the screen" in Settings → Copilot → Engine.',
  ocr: 'Text-only (OCR) screen reading is not available yet. Choose "Vision model" in Settings → Copilot → Engine.',
  permission: 'Screen Recording is off for Careerloom. Allow it in System Settings → Privacy & Security → Screen Recording, then reopen Careerloom.',
  budget: 'Screenshot limit for this session reached. Answers keep working without the screen.',
  failed: 'Could not capture the screen. Answers keep working without it.',
}
const PRE_MAX_AGE_MS = 30_000
const SENT_MS = 2500
/** The same question asked again inside this window (impatient hotkey presses, an STT re-emit) never restarts a good answer. */
const DEDUPE_MS = 15_000
const norm = (t: string): string => t.toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim()

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
  /** Keep-alive ping period while listening (default 20 s). */
  warmEveryMs?: number
  screen?: ScreenDeps
  /** How long an answer waits for a screen capture before going out text-only (default 800 ms). */
  screenWaitMs?: number
  /** The candidate's mic is mid-utterance (voice activity), text or not: practice keeps waiting. */
  speaking?(): boolean
}

const MAX_LINES = 200
const ANSWER_KINDS: ReadonlySet<string> = new Set<PromptKind>(['answer', 'followup', 'clarify', 'summarise', 'detail'])
const SUMMARISE_PROMPT = 'Summarise the conversation so far'
// Practice: how long the interviewer waits after the candidate's turn ends (on top of the STT's own end-of-turn silence)
// before taking it as the answer. A short start ("So I think…") waits longer: the candidate is thinking or reading a suggestion.
const REPLY_MS = 2_500
const REPLY_SHORT_MS = 10_000
const SHORT_WORDS = 6
/** Speech that resumes after a turn ended holds the answer open; this ends it if no new turn end follows (an empty final has none). */
const QUIET_MS = 10_000
/** Voice activity holds the answer open (recognition sends no text for the middle of a long stretch); past this without any
 *  text it is taken for noise, so a noisy room cannot hold the answer forever. */
const NOISE_HOLD_MS = 45_000
/** A turn of only these is not an answer ("Thank you." and "you" are also speech recognition's guesses on silence). */
const FILLERS = new Set(['um', 'umm', 'uh', 'er', 'erm', 'hmm', 'mm', 'mhm', 'mm-hmm', 'uh-huh', 'ah', 'oh', 'ok', 'okay', 'so', 'well', 'thank', 'thanks', 'you', 'bye'])
/** Words for the hand-off rules, in any script; a Chinese or Japanese character counts as one (those scripts put no spaces between words). */
const wordsOf = (t: string): string[] => (t.toLowerCase().match(/[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}'-]+/gu) ?? []).map(w => w.replace(/^[-']+|[-']+$/g, '')).filter(Boolean)
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
  let reqSeq = 0 // stamps every published suggestion with its request
  let answering: { qid: string; done: Promise<void> } | null = null // the answer still streaming: More detail waits for it
  const answeredLines = new Set<string>() // transcript lines already answered on demand: their final is not a new question
  let current: AbortController | null = null
  let currentDetail: AbortController | null = null // More detail streams beside the answer it expands
  const shownFor = new Map<string, { say: string; bullets: string[]; star: Suggestion['star'] }>() // the answer on screen per question: what More detail builds on
  let tail: { q: DetectedQuestion; text: string; at: number; asked: boolean } | null = null // the last interviewer final that became a question
  let gen = 0 // bumped by reset/Clear: a detection that was already awaiting the detector when it happened is dropped
  let deferred: ReturnType<typeof setTimeout> | null = null // an auto-ask waiting out the min gap
  let handoff: ReturnType<typeof setTimeout> | null = null // practice: the candidate's finished turn, waiting to become their answer
  let heardAt = 0 // practice: the candidate's last line or turn end
  const holdTurn = (): void => { if (handoff) clearTimeout(handoff); handoff = null }
  const handOverIn = (ms: number): void => { holdTurn(); handoff = setTimeout(handOver, ms); handoff.unref?.() }
  type Ask = { key: string; at: number; live: boolean; failed: boolean }
  let lastAsk: Ask | null = null // the answer most recently started, for the same-question dedupe
  let lastDetail: Ask | null = null // the same for More detail, kept apart so it never unblocks a repeated answer
  const auto = createAutoAsk({ now })
  const spec = createSpeculator({ engine: d.engine, transcript: () => lines, config: d.config, now })

  // Connection pre-warm: a tokenless request at session start, repeated while listening so the socket never idles out
  // (Node's HTTP client closes idle keep-alive sockets after seconds). Best effort: the provider swallows failures.
  let warmTimer: ReturnType<typeof setInterval> | null = null
  const stopWarm = (): void => { if (warmTimer) clearInterval(warmTimer); warmTimer = null }
  const startWarm = (): void => {
    stopWarm()
    void d.engine.warm?.().catch(() => undefined)
    warmTimer = setInterval(() => { void d.engine.warm?.().catch(() => undefined) }, d.warmEveryMs ?? 20_000)
    warmTimer.unref?.()
  }
  // Screen reading: a held late frame, the one capture in flight, and an epoch so a capture finishing after the session ended is discarded.
  let lateShot: ShotLike | null = null
  let pending: Promise<ShotLike> | null = null
  let epoch = 0
  let sentTimer: ReturnType<typeof setTimeout> | null = null
  const screenEvent = (p: CopilotEvents['copilotScreen']): void => d.host.publish('copilotScreen', p)
  const block = (reason: Blocked, extra: { message?: string; suggestion?: string } = {}): void => screenEvent({ state: 'blocked', reason, message: extra.message ?? (reason === 'no-vision' ? undefined : BLOCK_TEXT[reason]), ...(extra.suggestion ? { suggestion: extra.suggestion } : {}) })
  const sent = (): void => { screenEvent({ state: 'sent' }); if (sentTimer) clearTimeout(sentTimer); sentTimer = setTimeout(() => screenEvent({ state: 'idle' }), SENT_MS); sentTimer.unref?.() }
  const dropScreen = (): void => { epoch++; lateShot = null; pending = null; if (sentTimer) clearTimeout(sentTimer); sentTimer = null; d.screen?.clear() }
  const grab = (): Promise<ShotLike> => (pending ??= d.screen!.capture().finally(() => { pending = null }))
  const blockFor = (e: unknown): void => block(e instanceof ScreenshotError && (e.code === 'permission' || e.code === 'budget') ? e.code : 'failed')
  /** Why this route can't use the screen right now (null = it can). Config → vision model; permission and budget are the capture's own. */
  function screenGate(tier: Route['tier']): { reason: Blocked; suggestion?: string } | null {
    const cfg = d.config().engine
    if (!cfg.screenshots) return { reason: 'off' }
    if (cfg.vision === 'ocr') return { reason: 'ocr' } // ponytail: OCR needs a dependency (tesseract.js) we don't ship; add when someone needs offline screen reading
    const e = checkVision(tierModel(d.config().engine, tier), tier, d.screen!.isVision)
    return e ? { reason: 'no-vision', suggestion: e.suggestion } : null
  }
  const noVisionText = (m: string, s?: string): string => `${m}${s ? ` Try ${s}.` : ''}`
  const blockGate = (g: NonNullable<ReturnType<typeof screenGate>>): void => block(g.reason, g.reason === 'no-vision' ? { message: noVisionText("This model can't read images.", g.suggestion), suggestion: g.suggestion } : {})

  /** The frame for this turn: null = answer text-only. `press` = the user asked for the screen (shows progress and failures). */
  async function screenFor(route: Route, press: boolean): Promise<ShotLike | null | 'stop'> {
    if (!d.screen || (!press && !route.needsScreenshot)) return null
    const g = screenGate(route.tier)
    if (g) { if (press) { blockGate(g); return 'stop' } return null }
    const held = lateShot ?? d.screen.latest(PRE_MAX_AGE_MS)
    lateShot = null
    if (held) { sent(); return held }
    const mine = epoch
    const p = grab()
    if (press) {
      screenEvent({ state: 'capturing' })
      try { const s = await p; sent(); return s } catch (e) { blockFor(e); return 'stop' }
    }
    const r = await Promise.race([p.then(s => ({ s }), (e: unknown) => ({ e })), new Promise<{ late: true }>(res => { const t = setTimeout(() => res({ late: true }), d.screenWaitMs ?? 800); t.unref?.() })])
    if ('s' in r) { sent(); return r.s }
    if ('e' in r) { blockFor(r.e); return null }
    // Slow: the text answer goes first; the frame is offered afterwards ("Re-answer with screen").
    void p.then(s => { if (mine !== epoch) return d.screen!.clear(); lateShot = s; screenEvent({ state: 'ready' }) }, () => undefined)
    return null
  }
  /** End-of-turn pre-capture: starts the capture while the question is being routed so the frame is ready when the answer asks. Never throws, never blocks. */
  function prefetch(q: DetectedQuestion): void {
    if (!d.screen) return
    const route = routeQuestion(q, d.config().engine)
    if (!route.needsScreenshot || screenGate(route.tier) || d.screen.latest(PRE_MAX_AGE_MS)) return
    grab().catch(() => undefined)
  }

  const unschedule = (): void => { if (deferred) clearTimeout(deferred); deferred = null }
  const undefer = (): void => { gen++; unschedule() } // gen: detections already awaiting the detector are dropped (reset, Clear, stop, panic)
  const reset = (): void => { dropScreen(); lines = []; questions = new Map(); lastQuestion = null; turn = []; holdTurn(); answeredLines.clear(); current?.abort(); current = null; currentDetail?.abort(); currentDetail = null; shownFor.clear(); tail = null; lastAsk = null; lastDetail = null; undefer(); d.detector.reset(); auto.reset(); spec.cancel() }
  const error = (message: string, extra: { actions?: CopilotEvents['copilotError']['actions']; suggestion?: string } = {}): void => d.host.publish('copilotError', { kind: 'engine', message, retrying: false, ...extra })
  const engineError = (e: unknown): void => {
    if (!(e instanceof LlmError)) return error(msg(e))
    const f = friendlyLlmError(e, { dataCollection: d.config().engine.openrouter.dataCollection })
    error(f.message, { actions: f.actions, ...(f.suggestion ? { suggestion: f.suggestion } : {}) })
  }
  const endDetail = (): void => { currentDetail?.abort(); currentDetail = null; lastDetail = null }
  const addQuestion = (q: DetectedQuestion): void => { endDetail(); questions.set(q.id, q); lastQuestion = q; d.recorder.question(q); d.host.publish('copilotQuestion', q) }
  /** More detail problems are a note under the answer, never the error panel that would cover it. */
  const detailNote = (message: string): void => d.host.publish('copilotError', { kind: 'detail', message, retrying: false })

  /** Mic-only live has no interviewer channel: the mic hears both sides, so its finals are candidates too (rules filter chatter). */
  const detectable = (l: TranscriptLine): boolean => mode === 'live' && l.final && !answeredLines.has(l.id) && (l.speaker === 'interviewer' || !sources.includes('system'))

  async function detect(line: TranscriptLine, sttFinalAt: number): Promise<void> {
    // A cut-off question and its continuation are one question: re-detect the joined text under the first one's id so the overlay and the session keep a single entry.
    const prev = tail
    const gap = prev ? sttFinalAt - prev.at : Infinity
    const merged = prev !== null && continuesQuestion(prev.text, line.text, gap)
    const l = merged ? { ...line, text: `${prev.text} ${line.text.trim()}` } : line
    const g = gen
    let q = await d.detector.feed({ ...l, speaker: 'interviewer' })
    if (g !== gen) return spec.take(l.id, '', '').run?.abort()
    const taken = spec.take(l.id, l.text, q?.id ?? '') // an early request for this line: adopted if the final matches, aborted otherwise
    if (!q) return taken.run?.abort()
    if (merged) { q = { ...q, id: prev.q.id }; if (prev.asked) auto.unask(); debugLog('copilot', 'question merged', { id: q.id, text: q.text }) }
    tail = { q, text: l.text, at: sttFinalAt, asked: false }
    addQuestion(q)
    prefetch(q)
    const cfg = d.config()
    const decision = cfg.engine.autoAnswer ? auto.decide(q, l, sources, cfg.engine) : null
    debugLog('copilot', 'question detected', { id: q.id, text: q.text, type: q.type, hint: q.hint, autoAnswer: cfg.engine.autoAnswer, sources, decision: decision ? (decision.ask ? 'ask' : decision.reason) : 'auto-answer off' })
    if (!decision?.ask) {
      taken.run?.abort()
      // A clarification right behind the question hit the min gap: ask once it clears if nothing newer was said (the overlay already shows it).
      const wait = decision?.reason === 'rate' ? auto.gapMs() : 0
      if (wait > 0) { unschedule(); deferred = setTimeout(() => { deferred = null; if (lastQuestion?.id === q.id) void askLater(q, l, sttFinalAt) }, wait); deferred.unref?.() }
      return
    }
    return startAuto(q, l, sttFinalAt, decision, taken)
  }

  /** The deferred ask: decide again now that the gap has passed. */
  async function askLater(q: DetectedQuestion, l: TranscriptLine, sttFinalAt: number): Promise<void> {
    const decision = auto.decide(q, l, sources, d.config().engine)
    if (decision.ask) await startAuto(q, l, sttFinalAt, decision, { run: null, outcome: null })
  }

  async function startAuto(q: DetectedQuestion, l: TranscriptLine, sttFinalAt: number, decision: Extract<ReturnType<typeof auto.decide>, { ask: true }>, taken: { run: SpecRun | null; outcome: TurnInfo['spec'] }): Promise<void> {
    if (tail?.q.id === q.id) tail.asked = true
    const screenTurn = decision.route.needsScreenshot && d.screen !== undefined && screenGate(decision.route.tier) === null
    if (screenTurn) taken.run?.abort() // an early text-only request can't carry the frame
    // speech end = the line's audio end; STT-final and detector times come from the wall clock (PERF-1 trace).
    const marks: TraceMarks = { speechEndAt: l.t1 ?? sttFinalAt, sttFinalAt, detectedAt: now() }
    const info: TurnInfo = { kind: decision.route.kind, tier: decision.route.tier, auto: true, spec: taken.outcome, gate: q.hint?.source ?? null, gateMs: q.hint?.gateMs ?? null }
    await answer('answer', q.id, { route: decision.route, run: screenTurn ? undefined : taken.run ?? undefined, marks, info })
  }

  async function answer(kind: PromptKind, questionId?: string, extra: { route?: Route; run?: SpecRun; marks?: TraceMarks; info?: TurnInfo; press?: boolean } = {}): Promise<void> {
    // Practice: asking for a suggestion means the answer is not over. A finished answer waits a little longer for more; a short
    // start waits for the real answer (the next turn end, or the soft answer timer).
    if (handoff) { if (turnWords().length >= SHORT_WORDS) handOverIn(REPLY_SHORT_MS); else holdTurn() }
    let q = (questionId ? questions.get(questionId) : undefined) ?? lastQuestion
    const detail = kind === 'detail'
    if (!q && detail) return detailNote('Nothing to expand yet: answer a question first.')
    if (!q) {
      // Flush what is still being said: the key is often pressed before the engine has finalised the question.
      const heard = kind === 'summarise' ? undefined : [...lines].reverse().find(l => l.text.trim() !== '' && !answeredLines.has(l.id))
      if (!heard && kind !== 'summarise') return error('Nothing to answer yet: no question has been heard')
      const text = heard?.text.trim() ?? SUMMARISE_PROMPT
      if (heard) answeredLines.add(heard.id)
      q = { id: `qm${++manual}`, text, type: questionType(text), confidence: 0.5, at: now(), auto: false }
      addQuestion(q)
    }
    const key = `${kind}|${norm(q.text)}`
    const prev = detail ? lastDetail : lastAsk
    if (!extra.press && prev?.key === key && !prev.failed && (prev.live || now() - prev.at < DEDUPE_MS)) { // a good answer still streaming is never restarted, however long it takes
      debugLog('copilot', 'answer deduped', { kind, questionId: q.id })
      return extra.run?.abort()
    }
    const ask: Ask = { key, at: now(), live: true, failed: false }
    if (detail) lastDetail = ask; else lastAsk = ask
    // More detail replaces only an older More detail; anything else also stops a More detail still streaming (it is stale).
    if (detail) currentDetail?.abort(); else { endDetail(); current?.abort() }
    const ac = new AbortController()
    if (detail) currentDetail = ac; else current = ac
    const reqId = ++reqSeq
    // The press is seen at once: a status in the answer's label row (no extra height), cleared when the detail card arrives.
    if (detail) detailNote(answering?.qid === q.id ? 'More detail after this answer…' : 'Writing more detail…')
    let finished = (): void => undefined
    if (!detail) { const done = new Promise<void>(r => { finished = r }); answering = { qid: q.id, done } }
    debugLog('copilot', 'answer start', { kind, questionId: q.id, text: q.text, manual: !extra.route })
    let shown = 0
    const run = extra.run
    run && ac.signal.addEventListener('abort', run.abort, { once: true })
    try {
      const route = extra.route ?? routeQuestion(q, d.config().engine, kind)
      const info: TurnInfo = extra.info ?? { kind: route.kind, tier: route.tier, auto: q.auto, spec: null, gate: q.hint?.source ?? null, gateMs: q.hint?.gateMs ?? null }
      const frame = detail ? null : await screenFor(route, extra.press === true) // ponytail: More detail is text-only; the answer it expands already saw the screen
      if (frame === 'stop') return
      if (ac.signal.aborted) return
      const image = frame ? { jpeg: frame.jpeg, captureMs: frame.timings.captureMs, encodeMs: frame.timings.encodeMs } : undefined
      if (run) { // adopt the early request: it learns its real turn marks now, then its held answer is released
        Object.assign(run.marks, extra.marks); Object.assign(run.info, { gate: info.gate, gateMs: info.gateMs })
        run.release()
      }
      if (detail && answering?.qid === q.id) await answering.done // expand the whole answer, not the half streamed so far
      if (ac.signal.aborted) return
      const prior = detail ? shownFor.get(q.id) : undefined
      for await (const s of run?.stream ?? d.engine.answer({ question: q, transcript: lines.filter(l => l.final), kind, signal: ac.signal, route, marks: extra.marks, info, ...(image ? { image } : {}), ...(prior ? { prior } : {}) })) {
        shown++
        if (!detail && kind !== 'summarise') shownFor.set(q.id, { say: s.say, bullets: s.bullets, star: s.star })
        d.recorder.suggestion(s)
        d.host.publish('copilotSuggestion', { ...s, reqId, ...(kind === 'clarify' || kind === 'summarise' ? { kind } : {}) })
      }
      debugLog('copilot', shown ? 'answer end' : 'answer ended with nothing shown (superseded or stopped)', { kind, questionId: q.id, suggestions: shown, aborted: ac.signal.aborted })
    } catch (e) {
      ask.failed = true
      debugLog('copilot', 'answer failed', { kind, questionId: q.id, error: e, code: e instanceof LlmError ? e.code : undefined })
      if (detail) detailNote(`More detail failed: ${e instanceof LlmError ? friendlyLlmError(e, { dataCollection: d.config().engine.openrouter.dataCollection }).message : msg(e)}`)
      else if (e instanceof LlmError && e.code === 'no_vision') block('no-vision', { message: noVisionText("This model can't read images.", e.suggestion), suggestion: e.suggestion })
      else engineError(e)
    } finally {
      finished()
      ask.live = false
      if (!shown) ask.failed = true // nothing reached the user (blocked, empty, stopped): the next press may try again
    }
  }

  /** The Clear shortcut: stop what is being answered and forget the unanswered question, so a stray line cannot be answered by the next press. */
  function clearPending(): void {
    current?.abort(); current = null; endDetail(); shownFor.clear()
    d.engine.cancelAll(); spec.cancel(); dropScreen()
    for (const l of lines) if (l.final) answeredLines.add(l.id)
    const keep = mode === 'practice' ? lastQuestion : null // the mock interviewer still waits for an answer to its question
    questions = keep ? new Map([[keep.id, keep]]) : new Map(); lastQuestion = keep; tail = null; lastAsk = null; undefer()
    debugLog('copilot', 'cleared')
    d.host.publish('copilotCleared', { at: now() })
  }

  /** The AI interviewer asked a question: it takes the same path as one heard on the interviewer channel (recorded, shown, auto-answered when on), so cues and suggestions match live. */
  async function interviewerAsked(q: DetectedQuestion): Promise<void> {
    holdTurn(); turn = [] // anything said before this question belonged to the last one, which the interviewer has moved on from
    const heard: DetectedQuestion = { ...q, auto: true, hint: q.hint ?? heuristicHint(q.text) }
    addQuestion(heard)
    prefetch(heard)
    if (d.config().engine.autoAnswer) await answer('answer', heard.id)
  }

  /** The Screenshot button / hotkey: answer the current question with the screen. Gates first so nothing is captured when it can't be used. */
  async function screenshot(): Promise<void> {
    if (!d.screen) return screenEvent({ state: 'blocked', reason: 'failed', message: 'Screenshots are not available in this build.' })
    const cfg = d.config().engine
    const g = screenGate(lastQuestion ? routeQuestion(lastQuestion, cfg).tier : cfg.tier)
    if (g) return blockGate(g)
    await answer('answer', undefined, { press: true })
  }

  d.host.onAction(a => { debugLog('copilot', 'action', { action: a, hasQuestion: lastQuestion !== null, lines: lines.length }); if (ANSWER_KINDS.has(a)) void answer(a as PromptKind); else if (a === 'screenshot') void screenshot(); else if (a === 'clear') clearPending() })

  const emit: Emit = (ev, payload) => {
    if (ev === 'copilotState') {
      const s = payload as CopilotEvents['copilotState']
      if (s.state === 'armed') { reset(); startWarm() }
      if (s.state === 'stopped') { stopWarm(); dropScreen(); undefer(); holdTurn() }
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
      if (mode === 'practice' && l.speaker === 'you') { heardAt = now(); if (handoff) handOverIn(QUIET_MS); void d.feed(l, false) } // still answering: the interviewer keeps waiting
      if (detectable(l)) void detect(l, now())
      else if (!l.final && mode === 'live' && l.speaker === 'interviewer' && sources.includes('system')) spec.onPartial(l)
    }
    d.host.publish(ev, payload)
  }

  /** The turn's words that carry content: fillers ('so', 'um', 'thank you') never make a short start look like an answer. */
  const turnWords = (): string[] => turn.flatMap(l => wordsOf(l.text)).filter(w => !FILLERS.has(w))
  /** Hands the candidate's finished answer (all finals of the turn, merged) to practice. */
  function handOver(): void {
    handoff = null
    if (turn.length === 0) return
    if (d.speaking?.() && now() - heardAt < NOISE_HOLD_MS) return handOverIn(REPLY_MS) // talking again, with no text yet
    const first = turn[0]!, last = turn[turn.length - 1]!
    const merged: TranscriptLine = { ...last, text: turn.map(l => l.text).join(' '), t0: first.t0 }
    turn = []
    void d.feed(merged, true)
  }

  /** A speaker's turn closed. In practice the interviewer waits a moment before taking it as the answer, as a person waits out a
   *  thinking pause: speaking again (or asking for a suggestion) keeps the answer open, and fillers alone never end it. */
  function endOfTurn(speaker: Speaker): void {
    if (speaker !== 'you' || turn.length === 0) return
    if (mode !== 'practice') return handOver()
    heardAt = now()
    const words = turnWords()
    if (words.length === 0) return holdTurn()
    handOverIn(words.length < SHORT_WORDS ? REPLY_SHORT_MS : REPLY_MS)
  }

  return {
    emit, endOfTurn, answer, screenshot, interviewerAsked,
    /** Counters for the trace: speculative hit rate and wasted tokens. */
    metrics: () => ({ speculation: spec.stats() }),
    /** The session controller arrives after the wiring (it needs `emit`): the kill switch closes over it. */
    bindSession(ctl: { stop(reason: StopReason): Promise<void> }): void {
      d.host.setSessionHooks({ stopCapture: () => ctl.stop('panic'), abortRequests: () => { d.engine.cancelAll(); current?.abort(); currentDetail?.abort(); dropScreen(); undefer() } })
    },
  }
}
