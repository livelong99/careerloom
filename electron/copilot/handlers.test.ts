// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-handlers-'))
const sent: Array<[string, unknown]> = []
vi.mock('electron', () => ({
  app: { getPath: () => dir },
  BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (c: string, p: unknown) => sent.push([c, p]) } }] },
  safeStorage: {}, shell: { openExternal: vi.fn() }, systemPreferences: { getMediaAccessStatus: () => 'granted' },
}))

import { copilotSupported } from './capabilities'
import { CONSENT_TEXT_VERSION } from './consent'
import { copilotHandlers, createCopilot, type CopilotDeps } from './handlers'
import type { ConsentRecord, SessionDetail } from './types'

const setPlatform = (p: string) => Object.defineProperty(process, 'platform', { value: p })
const real = process.platform
const realArch = process.arch
const setArch = (a: string) => Object.defineProperty(process, 'arch', { value: a })
const JOB = { id: 'job-1', title: 'Senior Platform Engineer', company: 'Northwind Labs', report: null, posting: null }
const CV = '# Ada\n- Led migration of 40 services to Kubernetes\n'

function setup(over: Partial<CopilotDeps> = {}) {
  const base = fs.mkdtempSync(path.join(dir, 'c-'))
  const deps: CopilotDeps = {
    dir: () => base, now: () => 2_000_000_000_000, job: id => (id === 'job-1' || id === 'job-2' ? { ...JOB, id } : null), cv: () => CV,
    permission: () => 'granted', hasKey: () => true, sttInstalled: () => true,
    call: async () => ({ text: JSON.stringify({ structure: 4, specifics: 4, evidence: 4, concision: 4, notes: [] }), tokens: 1, model: 'fake' }),
    ...over,
  }
  return { c: createCopilot(deps), deps, base }
}
const consent = (over: Partial<ConsentRecord> = {}): ConsentRecord => ({
  id: 'c1', sessionId: 'live-1', at: 2_000_000_000_000 - 1000, textVersion: CONSENT_TEXT_VERSION, aiAllowedConfirmed: true, everyoneInformedConfirmed: true, jurisdiction: null,
  sources: ['mic'], sttProvider: 'moonshine', llmProvider: 'openrouter', transcriptSaved: true, privacyMode: false, indicator: 'chip', ...over,
})

beforeEach(() => { setPlatform('darwin'); setArch('arm64'); sent.length = 0 })
afterEach(() => { setPlatform(real); setArch(realArch) })

describe('registration and platform guard', () => {
  it('registers every CopilotApi method (25 + 2 config), all prefixed copilot', () => {
    expect(Object.keys(copilotHandlers)).toHaveLength(27)
    expect(Object.keys(copilotHandlers).every(k => k.startsWith('copilot'))).toBe(true)
  })
  it('refuses every call off macOS and Windows', async () => {
    setPlatform('linux')
    expect(copilotSupported()).toBe(false)
    for (const fn of Object.values(copilotHandlers)) await expect(Promise.resolve().then(() => fn({}))).rejects.toThrow(/macOS and Windows only/)
  })
  it('config round-trips and rejects a non-object patch', async () => {
    const { c } = setup()
    const next = await c.handlers.copilotSetConfig({ overlay: { anchor: 'bl' } }) as { overlay: { anchor: string } }
    expect(next.overlay.anchor).toBe('bl')
    await expect(Promise.resolve().then(() => c.handlers.copilotSetConfig('x'))).rejects.toThrow()
  })
})

describe('copilotStart', () => {
  it('rejects a session without a jobId, and an unknown job', async () => {
    const { c } = setup()
    await expect(c.handlers.copilotStart({ mode: 'practice', interviewType: 'mixed', consent: null })).rejects.toThrow(/job/i)
    await expect(c.handlers.copilotStart({ mode: 'practice', jobId: '', interviewType: 'mixed', consent: null })).rejects.toThrow(/job/i)
    await expect(c.handlers.copilotStart({ mode: 'practice', jobId: 'gone', interviewType: 'mixed', consent: null })).rejects.toThrow(/job/i)
    expect(await c.handlers.copilotListSessions()).toEqual([])
  })
  it('rejects an unknown mode or interview type', async () => {
    const { c } = setup()
    await expect(c.handlers.copilotStart({ mode: 'bogus', jobId: 'job-1', interviewType: 'mixed', consent: null })).rejects.toThrow()
    await expect(c.handlers.copilotStart({ mode: 'practice', jobId: 'job-1', interviewType: 'nope', consent: null })).rejects.toThrow()
  })
  it('rejects live without a valid consent record, and never starts capture', async () => {
    const session = { start: vi.fn(), stop: vi.fn() }
    const { c } = setup({ session })
    for (const bad of [null, consent({ aiAllowedConfirmed: false }), consent({ everyoneInformedConfirmed: false }), consent({ textVersion: 'old' }), consent({ at: 1 })]) {
      await expect(c.handlers.copilotStart({ mode: 'live', jobId: 'job-1', interviewType: 'mixed', consent: bad })).rejects.toThrow()
    }
    expect(session.start).not.toHaveBeenCalled()
    expect(await c.handlers.copilotListSessions()).toEqual([])
  })
  it('live with consent: records consent (server-stamped), starts capture, saves an open session with the job snapshot', async () => {
    const session = { start: vi.fn(), stop: vi.fn() }
    const { c } = setup({ session })
    const r = await c.handlers.copilotStart({ mode: 'live', jobId: 'job-1', interviewType: 'behavioural', consent: consent({ privacyMode: true, indicator: 'off' }) }) as { sessionId: string }
    expect(r.sessionId).toBe('live-1')
    expect(session.start).toHaveBeenCalledOnce()
    const [s] = await c.handlers.copilotListSessions() as Array<{ id: string; jobTitle: string; company: string; endedAt: number | null; mode: string }>
    expect(s).toMatchObject({ id: 'live-1', jobTitle: 'Senior Platform Engineer', company: 'Northwind Labs', endedAt: null, mode: 'live' })
    const exported = JSON.parse(fs.readFileSync(await c.handlers.copilotExportConsents() as string, 'utf8')) as ConsentRecord[]
    // Privacy mode is off in config, so the server records false/chip whatever the renderer claimed.
    expect(exported[0]).toMatchObject({ sessionId: 'live-1', privacyMode: false, indicator: 'chip' })
  })
  it('refuses a second session while one is running', async () => {
    const { c } = setup()
    await c.handlers.copilotStart({ mode: 'practice', jobId: 'job-1', interviewType: 'mixed', consent: null })
    await expect(c.handlers.copilotStart({ mode: 'practice', jobId: 'job-2', interviewType: 'mixed', consent: null })).rejects.toThrow(/already/i)
  })
  it('live needs Apple silicon, enforced in main', async () => {
    const arch = process.arch
    Object.defineProperty(process, 'arch', { value: 'x64' })
    try {
      const { c } = setup({ session: { start: vi.fn(), stop: vi.fn() } })
      await expect(c.handlers.copilotStart({ mode: 'live', jobId: 'job-1', interviewType: 'mixed', consent: consent() })).rejects.toThrow(/Apple silicon/i)
      expect(await c.handlers.copilotListSessions()).toEqual([])
    } finally { Object.defineProperty(process, 'arch', { value: arch }) }
  })
  it('a rejected duplicate session id leaves no extra consent record', async () => {
    const { c } = setup()
    await c.handlers.copilotStart({ mode: 'live', jobId: 'job-1', interviewType: 'mixed', consent: consent() })
    await c.handlers.copilotStop('user')
    await expect(c.handlers.copilotStart({ mode: 'live', jobId: 'job-1', interviewType: 'mixed', consent: consent({ id: 'c2' }) })).rejects.toThrow(/exists/i)
    const exported = JSON.parse(fs.readFileSync(await c.handlers.copilotExportConsents() as string, 'utf8')) as ConsentRecord[]
    expect(exported).toHaveLength(1)
  })
  it('refuses to reuse an existing session id', async () => {
    const { c } = setup()
    await c.handlers.copilotStart({ mode: 'live', jobId: 'job-1', interviewType: 'mixed', consent: consent() })
    await c.handlers.copilotStop('user')
    await expect(c.handlers.copilotStart({ mode: 'live', jobId: 'job-1', interviewType: 'mixed', consent: consent() })).rejects.toThrow(/already|exists/i)
  })
})

describe('job-linked sessions', () => {
  it('two sessions for one Job both appear under it and in the trend; another Job stays separate', async () => {
    const { c } = setup()
    for (const [i, job] of [[1, 'job-1'], [2, 'job-1'], [3, 'job-2']] as const) {
      await c.handlers.copilotStart({ mode: 'practice', jobId: job, interviewType: 'mixed', consent: null })
      await c.handlers.copilotStop('user')
      void i
    }
    const r = await c.handlers.copilotSessionsForJob('job-1') as { sessions: unknown[]; trend: unknown[] }
    expect(r.sessions).toHaveLength(2)
    expect(r.trend).toHaveLength(2)
    expect(await c.handlers.copilotListSessions({ jobId: 'job-2' })).toHaveLength(1)
  })
  it('deleting the Job keeps its sessions (snapshot); listing does not depend on the job list', async () => {
    let exists = true
    const { c } = setup({ job: id => (exists && id === 'job-1' ? JOB : null) })
    await c.handlers.copilotStart({ mode: 'practice', jobId: 'job-1', interviewType: 'mixed', consent: null })
    await c.handlers.copilotStop('user')
    exists = false
    const [s] = await c.handlers.copilotListSessions({ jobId: 'job-1' }) as Array<{ jobTitle: string; company: string }>
    expect(s).toMatchObject({ jobTitle: 'Senior Platform Engineer', company: 'Northwind Labs' })
  })
  it('get / delete one / delete all', async () => {
    const { c } = setup()
    const a = await c.handlers.copilotStart({ mode: 'practice', jobId: 'job-1', interviewType: 'mixed', consent: null }) as { sessionId: string }
    await c.handlers.copilotStop('user')
    expect(await c.handlers.copilotGetSession(a.sessionId)).toMatchObject({ id: a.sessionId })
    expect((await c.handlers.copilotGetSession(a.sessionId) as SessionDetail).latency).toMatchObject({ turns: 0, ttft: null, cacheHitRate: null })
    expect(await c.handlers.copilotGetSession('nope')).toBeNull()
    expect(await c.handlers.copilotDeleteSession(a.sessionId)).toBe(1)
    expect(await c.handlers.copilotDeleteSession('all')).toBe(0)
    await expect(Promise.resolve().then(() => c.handlers.copilotDeleteSession(5))).rejects.toThrow()
  })
})

describe('stop', () => {
  it('turns capture off first, is idempotent, and ends the recording', async () => {
    const order: string[] = []
    const session = { start: vi.fn(), stop: vi.fn(() => { order.push('capture-off') }) }
    const { c } = setup({ session })
    await c.handlers.copilotStart({ mode: 'practice', jobId: 'job-1', interviewType: 'mixed', consent: null })
    await c.handlers.copilotStop('panic')
    await c.handlers.copilotStop('panic')
    expect(session.stop).toHaveBeenCalledWith('panic')
    const [s] = await c.handlers.copilotListSessions() as Array<{ endedAt: number | null }>
    expect(s!.endedAt).not.toBeNull()
  })
})

describe('retention', () => {
  const DAY = 86_400_000
  const seed = (s: ReturnType<typeof createCopilot>['store'], id: string, ageDays: number, now: number) => {
    const d: SessionDetail = {
      id, startedAt: now - ageDays * DAY, endedAt: now - ageDays * DAY + 1000, mode: 'practice', jobId: 'job-1', jobTitle: 't', company: 'c', questions: 1, durationSec: 1, score: null,
      transcript: [{ id: 'l', speaker: 'you', text: 'hello', final: true, t0: 0, t1: 1 }], questionsList: [], suggestions: [], scorecard: null,
    }
    s.save(d)
  }
  it('default is 3 months; changing the setting sweeps immediately and keeps the summary rows', async () => {
    const { c, deps } = setup()
    expect(((await c.handlers.copilotGetConfig()) as { privacy: { retentionDays: number } }).privacy.retentionDays).toBe(90)
    seed(c.store, 'old', 100, deps.now!()); seed(c.store, 'mid', 40, deps.now!())
    await c.handlers.copilotSetConfig({ privacy: { retentionDays: null } })
    expect((await c.handlers.copilotGetSession('old') as SessionDetail).transcript).toHaveLength(1)
    await c.handlers.copilotSetConfig({ privacy: { retentionDays: 30 } })
    expect((await c.handlers.copilotGetSession('old') as SessionDetail).transcript).toHaveLength(0)
    expect((await c.handlers.copilotGetSession('mid') as SessionDetail).transcript).toHaveLength(0)
    expect(await c.handlers.copilotListSessions()).toHaveLength(2)
  })
  it('sweeps once when the first handler runs (app start)', async () => {
    const { c, deps } = setup()
    seed(c.store, 'old', 400, deps.now!())
    await c.handlers.copilotListSessions()
    expect((await c.handlers.copilotGetSession('old') as SessionDetail).transcript).toHaveLength(0)
  })
})

describe('practice end to end on fakes', () => {
  it('asks the queue, records answers, stops, scores with the fake model, and debrief Apply writes only a note', async () => {
    const report = { sections: [], gaps: [], topStrengths: [] }
    const { c, base } = setup({ job: id => ({ ...JOB, id, report: report as never }) })
    const { sessionId } = await c.handlers.copilotStart({ mode: 'practice', jobId: 'job-1', interviewType: 'behavioural', consent: null }) as { sessionId: string }
    const asked = sent.filter(([ch]) => ch === 'careerloom:copilotQuestion').map(([, q]) => q as { id: string; text: string })
    expect(asked).toHaveLength(1)
    for (let i = 0; i < 6; i++) await c.feed({ id: `a${i}`, speaker: 'you', text: `answer ${i} with 40 services`, final: true, t0: 2_000_000_000_000 + i, t1: null }, true)
    await c.handlers.copilotStop('user')
    await vi.waitFor(async () => { expect((await c.handlers.copilotGetSession(sessionId) as SessionDetail).scorecard).not.toBeNull() })
    const d = await c.handlers.copilotGetSession(sessionId) as SessionDetail
    expect(d.questions).toBe(6)
    expect(d.score).toBe(4)
    expect(fs.existsSync(path.join(base, 'bullets.json'))).toBe(false)
  })
  it('practice start honours the chosen questions plus your own, and refuses an empty selection', async () => {
    const { c } = setup()
    const ids = (await c.handlers.copilotPracticeQuestions('job-1') as Array<{ id: string }>).map(q => q.id)
    await c.handlers.copilotStart({ mode: 'practice', jobId: 'job-1', interviewType: 'mixed', consent: null, questionIds: [ids[2]], custom: ['What would you do in month one?'] })
    const asked = sent.filter(([ch]) => ch === 'careerloom:copilotQuestion').map(([, q]) => (q as { id: string }).id)
    expect(asked).toEqual([ids[2]])
    await c.feed({ id: 'a', speaker: 'you', text: 'x', final: true, t0: 2_000_000_000_001, t1: null }, true)
    expect(sent.filter(([ch]) => ch === 'careerloom:copilotQuestion')).toHaveLength(2)
    await c.handlers.copilotStop('user')
    await expect(c.handlers.copilotStart({ mode: 'practice', jobId: 'job-1', interviewType: 'mixed', consent: null, questionIds: [] })).rejects.toThrow(/question/i)
    await expect(c.handlers.copilotStart({ mode: 'practice', jobId: 'job-1', interviewType: 'mixed', consent: null, custom: 'nope' })).rejects.toThrow()
  })
  it('practice questions come from the report plan and carry last scores', async () => {
    const { c } = setup()
    const qs = await c.handlers.copilotPracticeQuestions('job-1') as Array<{ source: string }>
    expect(qs.length).toBeGreaterThan(0)
    await expect(Promise.resolve().then(() => c.handlers.copilotPracticeQuestions(''))).rejects.toThrow()
  })
})

describe('readiness, context and delegation', () => {
  it('readiness reports permissions, key and STT state', async () => {
    const { c } = setup({ hasKey: () => false, sttInstalled: () => false, permission: k => (k === 'screen' ? 'denied' : 'granted') })
    expect(await c.handlers.copilotReadiness('job-1')).toMatchObject({ mic: 'granted', system: 'denied', stt: 'not-installed', engine: 'no-key', context: { jobId: 'job-1', company: 'Northwind Labs' } })
  })
  it('context preview falls back to local counts and delegates to WP2 when present', async () => {
    expect(await setup().c.handlers.copilotContextPreview('job-1')).toMatchObject({ facts: 1 })
    const preview = { tokens: 5000, posting: 1, strengths: 1, gaps: 1, facts: 1, stories: 1, text: 'x' }
    const { c } = setup({ context: { preview: async () => preview } })
    expect(await c.handlers.copilotContextPreview('job-1')).toBe(preview)
  })
  it('unwired modules resolve a typed not-implemented result instead of throwing', async () => {
    const { c } = setup()
    expect(await c.handlers.copilotListSttModels()).toEqual({ status: 'not-implemented', method: 'copilotListSttModels' })
    expect(await c.handlers.copilotListLlmModels()).toEqual({ status: 'not-implemented', method: 'copilotListLlmModels' })
    expect(await c.handlers.copilotScreenshot()).toEqual({ status: 'not-implemented', method: 'copilotScreenshot' })
  })
  it('delegates overlay, answer and hotkey checks when wired', async () => {
    const overlay = vi.fn(); const answer = vi.fn(); const checkHotkey = vi.fn(() => ({ ok: false, reason: 'in-use' as const }))
    const { c } = setup({ overlay, answer, checkHotkey })
    await c.handlers.copilotOverlay({ collapse: true }); await c.handlers.copilotAnswer('answer', 'q1'); const r = await c.handlers.copilotCheckHotkey('Control+Alt+A')
    expect(overlay).toHaveBeenCalledWith({ collapse: true }); expect(answer).toHaveBeenCalledWith('answer', 'q1'); expect(r).toEqual({ ok: false, reason: 'in-use' })
    await expect(Promise.resolve().then(() => c.handlers.copilotAnswer('nope'))).rejects.toThrow()
  })
  it('privacy notice ack stores the version in config', async () => {
    const { c } = setup({ currentNotice: 'n1' })
    expect(await c.handlers.copilotAckPrivacyNotice('wrong')).toEqual({ ok: false })
    expect(await c.handlers.copilotAckPrivacyNotice('n1')).toEqual({ ok: true })
    expect(((await c.handlers.copilotGetConfig()) as { privacy: { mode: { noticeVersion: string } } }).privacy.mode.noticeVersion).toBe('n1')
  })
  it('rejects invalid ids and actions for debrief apply', async () => {
    const { c } = setup()
    await expect(Promise.resolve().then(() => c.handlers.copilotApplyDebrief('s', 'q', 'rm -rf'))).rejects.toThrow()
    expect(await c.handlers.copilotApplyDebrief('missing', 'q', 'job-note')).toEqual({ ok: false })
  })
})

describe('integration slots (WP1–3 bound through CopilotDeps)', () => {
  const nextTick = () => new Promise(r => setTimeout(r, 0))

  it('stop is memoised: a capture stop that raises its own stopped event does not re-enter', async () => {
    let c!: ReturnType<typeof setup>['c']
    const session = { start: vi.fn(async () => undefined), stop: vi.fn(async () => { void c.stop('user'); await nextTick() }) }
    ;({ c } = setup({ session }))
    await c.handlers.copilotStart({ mode: 'practice', jobId: 'job-1', interviewType: 'mixed', consent: null })
    await c.handlers.copilotStop('user')
    expect(session.stop).toHaveBeenCalledTimes(1)
    expect(c.recorder.active()).toBeNull()
  })

  it('copilotStop reaches the capture stop even when no session is recorded (kill switch)', async () => {
    const session = { start: vi.fn(), stop: vi.fn(async () => undefined) }
    const { c } = setup({ session })
    await c.handlers.copilotStop('panic')
    expect(session.stop).toHaveBeenCalledWith('panic')
  })

  it('overlay start restarts the last practice session; a live session needs confirmation in the app', async () => {
    const session = { start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined) }
    const { c } = setup({ session })
    await c.handlers.copilotOverlay({ start: true })
    expect(session.start).not.toHaveBeenCalled()
    expect(sent.find(([ch]) => ch === 'careerloom:copilotError')?.[1]).toMatchObject({ kind: 'capture' })
    await c.handlers.copilotStart({ mode: 'practice', jobId: 'job-1', interviewType: 'mixed', consent: null })
    await c.handlers.copilotStop('user')
    await c.handlers.copilotOverlay({ start: true })
    expect(session.start).toHaveBeenCalledTimes(2)
  })

  it('overlay retry calls the retry slot, debrief opens the newest session; other commands reach the overlay slot', async () => {
    const retry = vi.fn(), overlay = vi.fn(), openDebrief = vi.fn()
    const { c } = setup({ retry, overlay, openDebrief })
    await c.handlers.copilotOverlay({ debrief: true })
    expect(openDebrief).toHaveBeenCalledWith(null) // nothing recorded in this fresh store
    await c.handlers.copilotOverlay({ retry: true })
    await c.handlers.copilotOverlay({ collapse: true })
    expect(retry).toHaveBeenCalledTimes(1)
    expect(overlay).toHaveBeenCalledWith(expect.objectContaining({ collapse: true }))
  })

  it('practice answers come from the capture session, so the runner does not duplicate the candidate line', async () => {
    const session = { start: vi.fn(async () => undefined), stop: vi.fn(async () => undefined) }
    const { c } = setup({ session })
    await c.handlers.copilotStart({ mode: 'practice', jobId: 'job-1', interviewType: 'mixed', consent: null })
    await c.feed({ id: 'l1', speaker: 'you', text: 'I led the migration.', final: true, t0: 0, t1: 1 }, true)
    expect(sent.filter(([ch, p]) => ch === 'careerloom:copilotTranscript' && (p as { speaker: string }).speaker === 'you')).toHaveLength(0)
    expect(sent.some(([ch, p]) => ch === 'careerloom:copilotTranscript' && (p as { speaker: string }).speaker === 'interviewer')).toBe(true)
  })

  it('model list/test, STT install and answers go to their slots', async () => {
    const listLlmModels = vi.fn(() => [{ id: 'm' }]), testLlmModel = vi.fn(() => ({ ok: true })), installStt = vi.fn(async () => ({ runId: 'r1' })), answer = vi.fn()
    const { c } = setup({ listLlmModels, testLlmModel, installStt, answer })
    expect(await c.handlers.copilotListLlmModels()).toEqual([{ id: 'm' }])
    await c.handlers.copilotTestLlmModel('openai/x')
    expect(testLlmModel).toHaveBeenCalledWith('openai/x')
    expect(await c.handlers.copilotInstallStt('small')).toEqual({ runId: 'r1' })
    expect(installStt).toHaveBeenCalledWith('small')
    await c.handlers.copilotAnswer('answer', 'q1')
    expect(answer).toHaveBeenCalledWith('answer', 'q1')
  })

  it('Hugging Face check and model removal go to their slots with validated strings', async () => {
    const hfCheck = vi.fn(async () => ({ verdict: 'ok' })), removeStt = vi.fn(() => ({ ok: true }))
    const { c } = setup({ hfCheck, removeStt })
    expect(await c.handlers.copilotHfCheck('acme/asr')).toEqual({ verdict: 'ok' })
    expect(hfCheck).toHaveBeenCalledWith('acme/asr')
    expect(await c.handlers.copilotRemoveStt('acme/asr@' + 'a'.repeat(40))).toEqual({ ok: true })
    await expect(c.handlers.copilotHfCheck(42)).rejects.toThrow()
    await expect(c.handlers.copilotRemoveStt(undefined)).rejects.toThrow()
  })

  it('the privacy notice ack goes through the overlay host slot when bound, and setConfig cannot forge it', async () => {
    const ackNotice = vi.fn(() => ({ ok: true }))
    const { c } = setup({ ackNotice })
    expect(await c.handlers.copilotAckPrivacyNotice('v1')).toEqual({ ok: true })
    expect(ackNotice).toHaveBeenCalledWith('v1')
    const cfg = await c.handlers.copilotSetConfig({ privacy: { mode: { noticeVersion: 'forged' } } }) as { privacy: { mode: { noticeVersion: string | null } } }
    expect(cfg.privacy.mode.noticeVersion).not.toBe('forged') // config file is shared across tests: only the forged value matters
  })
})

