// Copilot IPC handlers (plan §4). Every call is refused off macOS. WP0 stubs are replaced here by real bodies for sessions,
// consent, retention, practice, debrief and Setup; capture/STT (WP3), engine/context (WP2) and overlay/hotkeys (WP1) plug in via `CopilotDeps`.
import { summarizeTraces } from './trace'
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { broadcast, Handler, str } from '../context'
import type { ModelCall } from '../job-view/jdStructure'
import type { JobPosting, ReportView } from '../job-view/types'
import { assertSupported, copilotSupported } from './capabilities'
import { CONSENT_TEXT_VERSION, validateConsent } from './consent'
import { readCopilotConfig, writeCopilotConfig } from './config'
import { applyDebrief, scoreSession } from './debrief'
import { buildDefaults } from './defaults'
import { parsePlan } from '../interviewer/plan'
import { createInterview, writeSkillSignal, type Interview, type InterviewDeps } from '../interviewer/session'
import { createPracticeRunner, questionsFromReport, selectQuestions, type PracticeExtras, type PracticeRunner } from './practice'
import { buildContext } from './setup'
import { createRecorder, openSessionStore, type SessionStore } from './store'
import type {
  DetectedQuestion, Anchor, ContextPreview, CopilotApi, CopilotConfig, DeepPartial, InterviewType, NotImplemented, OverlayCommand, PermStatus, SessionDetail, SourceHealth, SourceId, StartRequest, StopReason, TranscriptLine,
} from './types'

const SESSION_ID = /^[\w-]{1,80}$/
const MODES = ['practice', 'live'] as const
const INTERVIEW_TYPES: readonly InterviewType[] = ['recruiter', 'behavioural', 'technical', 'system-design', 'mixed']
const INTERVIEWER_CMDS = ['replay', 'skip', 'hint'] as const
const TYPED_MAX = 2000
const typedText = (v: unknown): string => {
  if (typeof v !== 'string' || v.length > TYPED_MAX) throw new Error(`typed answer must be text up to ${TYPED_MAX} characters`)
  return v
}
const ANSWER_KINDS = ['answer', 'followup', 'clarify', 'summarise'] as const
const DEBRIEF_ACTIONS = ['resume-bullet', 'job-note'] as const
const PANES = ['microphone', 'system-audio', 'screen'] as const
const RESCORE_COOLDOWN_MS = 60_000

export type JobInfo = { id: string; title: string; company: string; report: ReportView | null; posting: Pick<JobPosting, 'requirements' | 'skills' | 'techStack' | 'summary'> | null }

/** Everything that touches the outside world. Defaults below use Electron/career-ops; tests inject fakes; WP1–3 fill the optional slots. */
export type CopilotDeps = {
  dir: () => string
  now?: () => number
  job(id: string): JobInfo | null
  cv(): string
  permission(kind: 'microphone' | 'screen'): PermStatus
  hasKey(): boolean
  sttInstalled(): boolean
  /** Text-only, single-shot model call used for scoring. */
  call: ModelCall
  openSettings?(pane: (typeof PANES)[number]): boolean
  // WP3: capture + local STT
  session?: { start(req: StartRequest, sessionId: string): unknown; stop(reason: StopReason): unknown }
  probe?(source: SourceId, ms: number): Promise<SourceHealth> | SourceHealth
  sttModels?(): unknown
  benchmark?(sel: unknown): Promise<unknown> | unknown
  installStt?(model?: string): Promise<{ runId: string }> | { runId: string }
  // WP2: model list / test for the answer-model pickers
  listLlmModels?(): Promise<unknown> | unknown
  testLlmModel?(id: string): Promise<unknown> | unknown
  // WP2: engine + context
  answer?(kind: (typeof ANSWER_KINDS)[number], questionId?: string): void
  context?: { preview(jobId: string): Promise<ContextPreview> | ContextPreview }
  /** Text in, text out (engine provider, collected); drives practice follow-ups. */
  complete?(system: string, user: string): Promise<string>
  // WP1: overlay + hotkeys + privacy notice
  overlay?(cmd: OverlayCommand): void
  /** Reopen speech recognition for the running session (overlay Retry). */
  retry?(): Promise<void> | void
  /** Bring the main window forward on the Sessions page (overlay "Open debrief"). */
  openDebrief?(sessionId: string | null): void
  /** Records the Privacy mode notice ack (and refreshes the overlay); without it the ack is written straight to config. */
  ackNotice?(version: string): { ok: boolean }
  checkHotkey?(accel: string): { ok: boolean; reason?: 'in-use' | 'reserved' | 'invalid' }
  currentNotice?: string
  /** M3: answer the current question with the screen (capture, then the engine with the image). Progress and failures go out as `copilotScreen` events. */
  screenshot?(): Promise<void> | void
  /** Deletes held screenshot frames (session deleted, quit, panic). */
  clearScreenshots?(): void
  /** AI interviewer (KB-WP4): question base, voice, stats write-back. `events` routes the interviewer's lines/questions through the live wiring so cues and suggestions match live. */
  interviewer?: InterviewDeps & { events?: { line(l: TranscriptLine): void; question(q: DetectedQuestion): void } }
}

const notImplemented = (method: string): NotImplemented => ({ status: 'not-implemented', method })
const jobIdOf = (v: unknown): string => {
  const s = str(v, 'job id')
  if (s.trim() === '' || s.length > 500) throw new Error('Pick a job first: every session belongs to a job')
  return s
}
const sessionIdOf = (v: unknown, name = 'session id'): string => {
  const s = str(v, name)
  if (!SESSION_ID.test(s)) throw new Error(`Invalid ${name}`)
  return s
}
const oneOf = <T extends string>(v: unknown, allowed: readonly T[], name: string): T => {
  if (!allowed.includes(v as T)) throw new Error(`Unknown ${name}`)
  return v as T
}

const ANCHORS: readonly Anchor[] = ['tl', 'tc', 'tr', 'ml', 'c', 'mr', 'bl', 'bc', 'br']
const flag = (v: unknown, name: string): boolean | undefined => {
  if (v === undefined) return undefined
  if (typeof v !== 'boolean') throw new Error(`${name} must be a boolean`)
  return v
}
/** Overlay command from the renderer: known keys only, typed. `{}` is the overlay's heartbeat. */
function overlayCmd(raw: unknown): OverlayCommand {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new Error('cmd must be an object')
  const c = raw as Record<string, unknown>
  if (c.moveTo !== undefined && !ANCHORS.includes(c.moveTo as Anchor)) throw new Error('moveTo must be an anchor')
  return {
    collapse: flag(c.collapse, 'collapse'), hide: flag(c.hide, 'hide'), quickHide: flag(c.quickHide, 'quickHide'), passive: flag(c.passive, 'passive'),
    moveTo: c.moveTo as Anchor | undefined, start: flag(c.start, 'start'), retry: flag(c.retry, 'retry'), debrief: flag(c.debrief, 'debrief'),
    interviewer: c.interviewer === undefined ? undefined : oneOf(c.interviewer, INTERVIEWER_CMDS, 'interviewer command'),
    typed: c.typed === undefined ? undefined : typedText(c.typed),
  }
}
/** Only `copilotAckPrivacyNotice` may record that the Privacy mode notice was seen. */
function withoutNoticeAck(patch: DeepPartial<CopilotConfig>): DeepPartial<CopilotConfig> {
  const mode = patch.privacy?.mode
  if (!mode || !('noticeVersion' in mode)) return patch
  const { noticeVersion: _dropped, ...rest } = mode
  return { ...patch, privacy: { ...patch.privacy, mode: rest } }
}

export function createCopilot(deps: CopilotDeps) {
  const now = deps.now ?? Date.now
  let opened: SessionStore | null = null
  // Opened on first use: `app.getPath` is not needed at import time.
  const store: SessionStore = new Proxy({} as SessionStore, { get: (_t, k) => (opened ??= openSessionStore(deps.dir()))[k as keyof SessionStore] })
  const recorder = createRecorder(store, now)
  let practice: PracticeRunner | null = null
  let interview: Interview | null = null
  let lastPractice: StartRequest | null = null
  let swept = false
  const scoring = new Set<string>()
  const lastScoreTry = new Map<string, number>()

  const sweep = (): number => store.sweep(readCopilotConfig().privacy.retentionDays, now())
  const score = (id: string): void => {
    if (scoring.has(id)) return
    scoring.add(id); lastScoreTry.set(id, now())
    void scoreSession({ store, call: deps.call, cv: deps.cv }, id).finally(() => scoring.delete(id))
  }

  let stopping: Promise<void> | null = null
  /** One stop at a time: the capture stop itself raises a 'stopped' state event that lands back here. */
  const stopAll = (reason: StopReason): Promise<void> => (stopping ??= Promise.resolve().then(() => doStop(reason)).finally(() => { stopping = null })) // deferred: `stopping` must be set before doStop can re-enter
  const doStop = async (reason: StopReason): Promise<void> => {
    // The kill switch must run even when no session is recorded (overlay stop button, panic): capture stop is idempotent.
    if (!recorder.active()) { try { await deps.session?.stop(reason) } catch (err) { console.error('copilot capture stop failed:', err instanceof Error ? err.message : String(err)) }; return }
    // Capture off first, then everything else; a failing capture stop must not keep a session open.
    try { await deps.session?.stop(reason) } catch (err) { console.error('copilot capture stop failed:', err instanceof Error ? err.message : String(err)) }
    practice?.stop(); practice = null
    const iv = interview; interview = null
    if (iv) deps.interviewer?.ended?.()
    const ended = recorder.end()
    const done = ended && iv ? saveInterview(ended, iv) : ended
    if (!deps.session) broadcast('careerloom:copilotState', { state: 'stopped', mode: done?.mode ?? 'practice', sessionId: null, sources: [], startedAt: null })
    sweep()
    if (done) score(done.id)
  }

  async function start(raw: unknown): Promise<{ sessionId: string }> {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<StartRequest> & PracticeExtras
    const jobId = jobIdOf(r.jobId)
    const mode = oneOf(r.mode, MODES, 'session mode')
    const interviewType = oneOf(r.interviewType, INTERVIEW_TYPES, 'interview type')
    assertSupported(mode === 'live')
    const job = deps.job(jobId)
    if (!job) throw new Error('That job is no longer in your list: pick another one')
    if (recorder.active()) throw new Error('A session is already running: stop it first')
    const strings = (v: unknown, name: string): string[] | undefined => {
      if (v === undefined) return undefined
      if (!Array.isArray(v) || !v.every(x => typeof x === 'string' && x.length <= 500) || v.length > 50) throw new Error(`${name} must be a list of short strings`)
      return v as string[]
    }
    const extras: PracticeExtras = { questionIds: strings(r.questionIds, 'questionIds'), custom: strings(r.custom, 'custom') }
    const plan = r.interview === undefined ? null : parsePlan(r.interview)
    if (plan && mode !== 'practice') throw new Error('The AI interviewer is for practice sessions only')
    if (mode === 'practice' && !plan) selectQuestions(job.report, extras) // fail before anything is saved
    const cfg = readCopilotConfig()
    let sessionId: string = randomUUID()
    if (mode === 'live') {
      const check = validateConsent(r.consent, now())
      if (!check.ok) throw new Error(check.reason)
      if (SESSION_ID.test(r.consent!.sessionId)) sessionId = r.consent!.sessionId
    }
    if (store.get(sessionId)) throw new Error('That session already exists') // before the consent record: a refused start leaves no record
    if (mode === 'live') {
      const c = r.consent!
      const pm = cfg.privacy.mode
      const privacyMode = pm.enabled && pm.noticeVersion !== null
      // Server-authoritative fields: the renderer cannot claim a different indicator, provider or retention than what is configured.
      store.appendConsent({
        ...c, id: SESSION_ID.test(c.id) ? c.id : randomUUID(), sessionId, textVersion: CONSENT_TEXT_VERSION, at: now(),
        jurisdiction: typeof c.jurisdiction === 'string' ? c.jurisdiction.slice(0, 40) : null, sources: [...new Set(c.sources)],
        sttProvider: cfg.stt.engine, llmProvider: cfg.engine.provider, transcriptSaved: cfg.privacy.retentionDays !== 0,
        privacyMode, indicator: privacyMode ? pm.indicator : 'chip',
      })
    }
    const iv = plan ? buildInterview(jobId, sessionId, plan, cfg) : null // throws (no question base) before anything is saved
    recorder.begin({ id: sessionId, mode, jobId, jobTitle: job.title, company: job.company })
    try {
      await deps.session?.start({ mode, jobId, interviewType, consent: mode === 'live' ? r.consent! : null }, sessionId)
    } catch (err) { recorder.end(); store.remove(sessionId); throw err }
    if (mode === 'practice') { if (iv) { interview = iv; practice = iv.runner; practice.start() } else startPractice(jobId, job, cfg, extras); lastPractice = { mode, jobId, interviewType, consent: null, ...extras, ...(plan ? { interview: plan } : {}) } }
    if (!deps.session) broadcast('careerloom:copilotState', { state: 'listening', mode, sessionId, sources: ['mic'], startedAt: now() })
    return { sessionId }
  }

  /** The AI interviewer's runner for one session. Its lines and questions take the live path when the wiring is present. */
  function buildInterview(jobId: string, sessionId: string, plan: ReturnType<typeof parsePlan>, cfg: CopilotConfig): Interview {
    const ev = deps.interviewer?.events
    return createInterview({
      jobId, sessionId, plan, complete: deps.complete, answerMs: cfg.practice.answerMinutes * 60_000, now,
      deps: deps.interviewer ?? { pool: () => null },
      sink: {
        line: l => {
          if (l.speaker === 'you' && deps.session) return // already recorded and shown by the capture session
          if (l.speaker === 'interviewer' && ev) return ev.line(l)
          recorder.line(l); broadcast('careerloom:copilotTranscript', l)
        },
        question: q => { if (ev) ev.question(q); else { recorder.question(q); broadcast('careerloom:copilotQuestion', q) } },
        done: () => { void stopAll('user') },
      },
    })
  }
  /** Per-question results onto the stored session, plus the skill signal for Skill-up. Best effort: a disk error never blocks the stop. */
  function saveInterview(done: SessionDetail, iv: Interview): SessionDetail {
    const next: SessionDetail = { ...done, interview: iv.record() }
    try { store.save(next); writeSkillSignal(deps.dir(), iv.skillSignal()) } catch (err) { console.error('copilot interview record failed:', err instanceof Error ? err.message : String(err)) }
    return next
  }

  function startPractice(jobId: string, job: JobInfo, cfg: CopilotConfig, extras: PracticeExtras): void {
    const questions = selectQuestions(job.report, extras, lastScores(jobId))
    practice = createPracticeRunner({
      questions, followups: cfg.practice.followups, answerMs: cfg.practice.answerMinutes * 60_000, complete: deps.complete, now,
      sink: {
        question: q => { recorder.question(q); broadcast('careerloom:copilotQuestion', q) },
        // The candidate's own lines are already recorded and shown by the capture session; only the mock interviewer's are new.
        line: l => { if (l.speaker === 'you' && deps.session) return; recorder.line(l); broadcast('careerloom:copilotTranscript', l) },
        done: () => { void stopAll('user') },
      },
    })
    practice.start()
  }

  let typedN = 0
  /** The typed-answer fallback (no microphone or speech recognition): the same path as a spoken final. */
  async function typedAnswer(text: string): Promise<void> {
    if (!practice || !interview || text.trim() === '') return
    const at = now()
    const l: TranscriptLine = { id: `typed-${++typedN}`, speaker: 'you', text: text.trim(), final: true, t0: at, t1: at }
    if (!deps.session) { recorder.line(l); broadcast('careerloom:copilotTranscript', l) }
    await practice.feed(l, true)
  }

  /** Newest score per question id from this job's earlier sessions (last 10). */
  function lastScores(jobId: string): Record<string, number> {
    const out: Record<string, number> = {}
    for (const s of store.list({ jobId }).slice(0, 10)) {
      if (s.score === null) continue
      for (const q of store.get(s.id)?.questionsList ?? []) if (!(q.id in out)) out[q.id] = s.score
    }
    return out
  }

  const readiness: CopilotApi['copilotReadiness'] = jobId => {
    const job = deps.job(jobId)
    if (!job) throw new Error('That job is no longer in your list')
    const { summary } = buildContext({ jobId, title: job.title, company: job.company, report: job.report, posting: job.posting, cv: deps.cv() })
    return { context: summary, mic: deps.permission('microphone'), system: deps.permission('screen'), stt: deps.sttInstalled() ? 'ready' : 'not-installed', engine: deps.hasKey() ? 'ready' : 'no-key' }
  }

  async function getSession(id: string): Promise<SessionDetail | null> {
    const d = store.get(id)
    // Contract has no "score now" call: an ended, answered, unscored session is (re)scored when opened, at most once a minute.
    if (d && d.endedAt !== null && d.scorecard === null && d.transcript.some(l => l.speaker === 'you') && now() - (lastScoreTry.get(id) ?? 0) > RESCORE_COOLDOWN_MS) score(id)
    return d && { ...d, latency: summarizeTraces(d.suggestions.flatMap(x => (x.done && x.trace ? [x.trace] : []))) }
  }

  const impl: Record<string, (...a: unknown[]) => unknown> = {
    copilotGetConfig: () => readCopilotConfig(),
    copilotSetConfig: (patch: unknown) => {
      if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) throw new Error('patch must be an object')
      const next = writeCopilotConfig(withoutNoticeAck(patch as DeepPartial<CopilotConfig>))
      if ('privacy' in patch && typeof patch.privacy === 'object' && patch.privacy !== null && 'retentionDays' in patch.privacy) sweep()
      return next
    },
    copilotReadiness: (jobId: unknown) => readiness(jobIdOf(jobId)),
    copilotContextPreview: async (jobId: unknown) => {
      const id = jobIdOf(jobId)
      if (deps.context) return deps.context.preview(id)
      const job = deps.job(id)
      if (!job) throw new Error('That job is no longer in your list')
      return buildContext({ jobId: id, title: job.title, company: job.company, report: job.report, posting: job.posting, cv: deps.cv() }).preview
    },
    copilotProbeAudio: (source: unknown, ms: unknown) => {
      const s = oneOf(source, ['mic', 'system'] as const, 'audio source')
      if (typeof ms !== 'number' || !(ms >= 500 && ms <= 10_000)) throw new Error('ms must be 500–10000')
      return deps.probe ? deps.probe(s, ms) : notImplemented('copilotProbeAudio')
    },
    copilotOpenSystemSettings: (pane: unknown) => deps.openSettings?.(oneOf(pane, PANES, 'settings pane')) ?? false,
    copilotStart: start,
    copilotStop: async (reason: unknown) => { await stopAll(oneOf(reason, ['user', 'panic', 'error'] as const, 'stop reason')) },
    copilotAnswer: (kind: unknown, questionId: unknown) => {
      const k = oneOf(kind, ANSWER_KINDS, 'answer kind')
      const q = questionId === undefined ? undefined : sessionIdOf(questionId, 'question id')
      return deps.answer ? void deps.answer(k, q) : notImplemented('copilotAnswer')
    },
    copilotOverlay: async (raw: unknown) => {
      const cmd = overlayCmd(raw)
      if (cmd.start) {
        if (recorder.active()) return
        if (!lastPractice) return broadcast('careerloom:copilotError', { kind: 'capture', message: 'Start a live session from Careerloom: it needs your confirmation first', retrying: false })
        await start(lastPractice)
        return
      }
      if (cmd.interviewer) return void interview?.control(cmd.interviewer)
      if (cmd.typed !== undefined) return void (await typedAnswer(cmd.typed))
      if (cmd.retry) return void (await deps.retry?.())
      if (cmd.debrief) return void deps.openDebrief?.(store.list()[0]?.id ?? null)
      return deps.overlay ? void deps.overlay(cmd) : notImplemented('copilotOverlay')
    },
    copilotAckPrivacyNotice: (version: unknown) => {
      const v = str(version, 'version')
      if (deps.ackNotice) return deps.ackNotice(v)
      if (v === '' || v.length > 40 || (deps.currentNotice !== undefined && v !== deps.currentNotice)) return { ok: false }
      writeCopilotConfig({ privacy: { mode: { noticeVersion: v } } })
      return { ok: true }
    },
    copilotListSessions: (filter: unknown) => {
      const jobId = typeof filter === 'object' && filter !== null && 'jobId' in filter ? jobIdOf((filter as { jobId: unknown }).jobId) : undefined
      return store.list(jobId ? { jobId } : undefined)
    },
    copilotSessionsForJob: (jobId: unknown) => { const id = jobIdOf(jobId); return { sessions: store.list({ jobId: id }), trend: store.trend(id) } },
    copilotGetSession: (id: unknown) => getSession(sessionIdOf(id)),
    copilotDeleteSession: (id: unknown) => { const n = store.remove(id === 'all' ? 'all' : sessionIdOf(id)); deps.clearScreenshots?.(); return n },
    copilotScreenshot: () => deps.screenshot ? void Promise.resolve().then(deps.screenshot).catch(() => undefined) : notImplemented('copilotScreenshot'),
    copilotExportConsents: () => {
      const dir = deps.dir()
      mkdirSync(dir, { recursive: true, mode: 0o700 })
      const file = join(dir, 'consents-export.json')
      writeFileSync(file, JSON.stringify(store.consents(), null, 2), { mode: 0o600 })
      return file
    },
    copilotPracticeQuestions: (jobId: unknown) => {
      const id = jobIdOf(jobId)
      return questionsFromReport(deps.job(id)?.report ?? null, [], lastScores(id))
    },
    copilotListLlmModels: () => deps.listLlmModels ? deps.listLlmModels() : notImplemented('copilotListLlmModels'),
    copilotTestLlmModel: (id: unknown) => deps.testLlmModel ? deps.testLlmModel(str(id, 'model id')) : notImplemented('copilotTestLlmModel'),
    copilotInstallStt: (model: unknown) => deps.installStt ? deps.installStt(model === undefined ? undefined : str(model, 'model')) : notImplemented('copilotInstallStt'),
    copilotListSttModels: () => deps.sttModels ? deps.sttModels() : notImplemented('copilotListSttModels'),
    copilotBenchmarkStt: (sel: unknown) => deps.benchmark ? deps.benchmark(sel) : notImplemented('copilotBenchmarkStt'),
    copilotCheckHotkey: (accel: unknown) => {
      const a = str(accel, 'accelerator')
      if (a.length === 0 || a.length > 60) return { ok: false, reason: 'invalid' }
      return deps.checkHotkey ? deps.checkHotkey(a) : notImplemented('copilotCheckHotkey')
    },
    copilotApplyDebrief: (sessionId: unknown, questionId: unknown, action: unknown) =>
      applyDebrief({ store: store, cv: deps.cv, dir: deps.dir() }, sessionIdOf(sessionId), sessionIdOf(questionId, 'question id'), oneOf(action, DEBRIEF_ACTIONS, 'debrief action')),
  }

  const handlers: Record<string, Handler> = Object.fromEntries(Object.entries(impl).map(([name, fn]) => [name, async (...args: unknown[]): Promise<unknown> => {
    if (!copilotSupported()) throw new Error('Interview Copilot is available on macOS only')
    if (!swept) { swept = true; sweep() }
    return fn(...args)
  }]))

  return {
    handlers, store, recorder,
    /** Ends the running session (capture off, persist, sweep, score). Safe to call from a 'stopped' state event. */
    stop: stopAll,
    /** STT → practice: call with the final "you" lines (endOfTurn when the answer finished). */
    feed: async (line: TranscriptLine, endOfTurn: boolean): Promise<void> => { await practice?.feed(line, endOfTurn) },
  }
}

// ————— Default wiring (Electron + career-ops): see defaults.ts —————

let instance: ReturnType<typeof createCopilot>
instance = createCopilot(buildDefaults(() => instance))
export const copilotHandlers = instance.handlers
/** Integration seams: the live wiring feeds practice answers and records transcript/questions/suggestions through these. */
export const copilotFeed = instance.feed
export const copilotRecorder = instance.recorder
