// Copilot IPC handlers (plan §4). Every call is refused off macOS. WP0 stubs are replaced here by real bodies for sessions,
// consent, retention, practice, debrief and Setup; capture/STT (WP3), engine/context (WP2) and overlay/hotkeys (WP1) plug in via `CopilotDeps`.
import { randomUUID } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { shell, systemPreferences } from 'electron'

import { broadcast, Handler, readApiKey, str, userFile } from '../context'
import { readCv } from '../resume-agent'
import { jobContext } from '../job-view/handlers'
import { runText } from '../job-view/agent'
import type { ModelCall } from '../job-view/jdStructure'
import type { JobPosting, ReportView } from '../job-view/types'
import { copilotSupported } from './capabilities'
import { CONSENT_TEXT_VERSION, validateConsent } from './consent'
import { readCopilotConfig, writeCopilotConfig } from './config'
import { applyDebrief, scoreSession } from './debrief'
import { createPracticeRunner, questionsFromReport, selectQuestions, type PracticeExtras, type PracticeRunner } from './practice'
import { buildContext } from './setup'
import { createRecorder, openSessionStore, type SessionStore } from './store'
import type {
  ContextPreview, CopilotApi, CopilotConfig, DeepPartial, InterviewType, NotImplemented, PermStatus, SessionDetail, SourceHealth, SourceId, StartRequest, StopReason, TranscriptLine,
} from './types'

const SESSION_ID = /^[\w-]{1,80}$/
const MODES = ['practice', 'live'] as const
const INTERVIEW_TYPES: readonly InterviewType[] = ['recruiter', 'behavioural', 'technical', 'system-design', 'mixed']
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
  // WP2: engine + context
  answer?(kind: (typeof ANSWER_KINDS)[number], questionId?: string): void
  context?: { preview(jobId: string): Promise<ContextPreview> | ContextPreview }
  /** Text in, text out (engine provider, collected); drives practice follow-ups. */
  complete?(system: string, user: string): Promise<string>
  // WP1: overlay + hotkeys + privacy notice
  overlay?(cmd: Record<string, unknown>): void
  checkHotkey?(accel: string): { ok: boolean; reason?: 'in-use' | 'reserved' | 'invalid' }
  currentNotice?: string
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

export function createCopilot(deps: CopilotDeps) {
  const now = deps.now ?? Date.now
  let opened: SessionStore | null = null
  // Opened on first use: `app.getPath` is not needed at import time.
  const store: SessionStore = new Proxy({} as SessionStore, { get: (_t, k) => (opened ??= openSessionStore(deps.dir()))[k as keyof SessionStore] })
  const recorder = createRecorder(store, now)
  let practice: PracticeRunner | null = null
  let swept = false
  const scoring = new Set<string>()
  const lastScoreTry = new Map<string, number>()

  const sweep = (): number => store.sweep(readCopilotConfig().privacy.retentionDays, now())
  const score = (id: string): void => {
    if (scoring.has(id)) return
    scoring.add(id); lastScoreTry.set(id, now())
    void scoreSession({ store, call: deps.call, cv: deps.cv }, id).finally(() => scoring.delete(id))
  }

  const stopAll = async (reason: StopReason): Promise<void> => {
    if (!recorder.active()) return
    // Capture off first, then everything else; a failing capture stop must not keep a session open.
    try { await deps.session?.stop(reason) } catch (err) { console.error('copilot capture stop failed:', err instanceof Error ? err.message : String(err)) }
    practice?.stop(); practice = null
    const done = recorder.end()
    if (!deps.session) broadcast('careerloom:copilotState', { state: 'stopped', mode: done?.mode ?? 'practice', sessionId: null, sources: [], startedAt: null })
    sweep()
    if (done) score(done.id)
  }

  async function start(raw: unknown): Promise<{ sessionId: string }> {
    const r = (typeof raw === 'object' && raw !== null ? raw : {}) as Partial<StartRequest> & PracticeExtras
    const jobId = jobIdOf(r.jobId)
    const mode = oneOf(r.mode, MODES, 'session mode')
    const interviewType = oneOf(r.interviewType, INTERVIEW_TYPES, 'interview type')
    const job = deps.job(jobId)
    if (!job) throw new Error('That job is no longer in your list: pick another one')
    if (recorder.active()) throw new Error('A session is already running: stop it first')
    const strings = (v: unknown, name: string): string[] | undefined => {
      if (v === undefined) return undefined
      if (!Array.isArray(v) || !v.every(x => typeof x === 'string' && x.length <= 500) || v.length > 50) throw new Error(`${name} must be a list of short strings`)
      return v as string[]
    }
    const extras: PracticeExtras = { questionIds: strings(r.questionIds, 'questionIds'), custom: strings(r.custom, 'custom') }
    if (mode === 'practice') selectQuestions(job.report, extras) // fail before anything is saved
    const cfg = readCopilotConfig()
    let sessionId: string = randomUUID()
    if (mode === 'live') {
      const check = validateConsent(r.consent, now())
      if (!check.ok) throw new Error(check.reason)
      const c = r.consent!
      if (SESSION_ID.test(c.sessionId)) sessionId = c.sessionId
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
    if (store.get(sessionId)) throw new Error('That session already exists')
    recorder.begin({ id: sessionId, mode, jobId, jobTitle: job.title, company: job.company })
    try {
      await deps.session?.start({ mode, jobId, interviewType, consent: mode === 'live' ? r.consent! : null }, sessionId)
    } catch (err) { recorder.end(); store.remove(sessionId); throw err }
    if (mode === 'practice') startPractice(jobId, job, cfg, extras)
    if (!deps.session) broadcast('careerloom:copilotState', { state: 'listening', mode, sessionId, sources: ['mic'], startedAt: now() })
    return { sessionId }
  }

  function startPractice(jobId: string, job: JobInfo, cfg: CopilotConfig, extras: PracticeExtras): void {
    const questions = selectQuestions(job.report, extras, lastScores(jobId))
    practice = createPracticeRunner({
      questions, followups: cfg.practice.followups, answerMs: cfg.practice.answerMinutes * 60_000, complete: deps.complete, now,
      sink: {
        question: q => { recorder.question(q); broadcast('careerloom:copilotQuestion', q) },
        line: l => { recorder.line(l); broadcast('careerloom:copilotTranscript', l) },
        done: () => { void stopAll('user') },
      },
    })
    practice.start()
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
    return d
  }

  const impl: Record<string, (...a: unknown[]) => unknown> = {
    copilotGetConfig: () => readCopilotConfig(),
    copilotSetConfig: (patch: unknown) => {
      if (typeof patch !== 'object' || patch === null || Array.isArray(patch)) throw new Error('patch must be an object')
      const next = writeCopilotConfig(patch as DeepPartial<CopilotConfig>)
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
    copilotOverlay: (cmd: unknown) => {
      if (typeof cmd !== 'object' || cmd === null || Array.isArray(cmd)) throw new Error('cmd must be an object')
      return deps.overlay ? void deps.overlay(cmd as Record<string, unknown>) : notImplemented('copilotOverlay')
    },
    copilotAckPrivacyNotice: (version: unknown) => {
      const v = str(version, 'version')
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
    copilotDeleteSession: (id: unknown) => store.remove(id === 'all' ? 'all' : sessionIdOf(id)),
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

  /** Untouched WP0 stubs (WP2's model list/test, M3 screenshot) keep their typed not-implemented result. */
  const STUBS = ['copilotScreenshot', 'copilotListLlmModels', 'copilotTestLlmModel'] as const
  for (const m of STUBS) impl[m] = () => notImplemented(m)

  const handlers: Record<string, Handler> = Object.fromEntries(Object.entries(impl).map(([name, fn]) => [name, async (...args: unknown[]): Promise<unknown> => {
    if (!copilotSupported()) throw new Error('Interview Copilot is available on macOS only')
    if (!swept) { swept = true; sweep() }
    return fn(...args)
  }]))

  return {
    handlers, store, recorder,
    /** STT → practice: call with the final "you" lines (endOfTurn when the answer finished). */
    feed: async (line: TranscriptLine, endOfTurn: boolean): Promise<void> => { await practice?.feed(line, endOfTurn) },
  }
}

// ————— Default wiring (Electron + career-ops) —————

const PRIVACY_PANE: Record<(typeof PANES)[number], string> = { microphone: 'Privacy_Microphone', 'system-audio': 'Privacy_AudioCapture', screen: 'Privacy_ScreenCapture' }

function defaultDeps(): CopilotDeps {
  return {
    dir: () => userFile('copilot'),
    job: id => {
      try { const c = jobContext(id); return { id, title: c.job.title, company: c.job.company, report: c.report, posting: c.posting } } catch { return null }
    },
    cv: () => readCv()?.markdown ?? '',
    permission: kind => { try { return systemPreferences.getMediaAccessStatus(kind) } catch { return 'unknown' } },
    hasKey: () => readApiKey() !== null,
    sttInstalled: () => false, // WP3 replaces this with the engine's install check
    call: prompt => runText(prompt, { tier: 'helper', label: 'Score interview practice' }),
    openSettings: pane => { void shell.openExternal(`x-apple.systempreferences:com.apple.preference.security?${PRIVACY_PANE[pane]}`); return true },
  }
}

const instance = createCopilot(defaultDeps())
export const copilotHandlers = instance.handlers
/** Integration seams for WP1–3: feed practice answers, record live transcript/questions/suggestions. */
export const copilotFeed = instance.feed
export const copilotRecorder = instance.recorder
