// @vitest-environment node
// Practice with the AI interviewer through the real Copilot handlers, on fakes (no network, no mic).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-iv-'))
const sent: Array<[string, unknown]> = []
vi.mock('electron', () => ({
  app: { getPath: () => dir },
  BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (c: string, p: unknown) => sent.push([c, p]) } }] },
  safeStorage: {}, shell: { openExternal: vi.fn() }, systemPreferences: { getMediaAccessStatus: () => 'granted' },
}))

import { GOLDEN_POOL, GOLDEN_SKILLS } from '../interviewer/fixtures/golden-kb'
import { createCopilot, type CopilotDeps } from './handlers'
import type { SessionDetail } from './types'

const setPlatform = (p: string) => Object.defineProperty(process, 'platform', { value: p })
const real = process.platform
beforeEach(() => { setPlatform('darwin'); sent.length = 0 })
afterEach(() => setPlatform(real))

const PLAN = { mode: 'technical', minutes: 8, focusSkills: [], difficulty: 'adaptive', includeGenerated: true, persona: { style: 's', seniority: 'senior', strictness: 1, name: 'Asha' }, voice: { engine: 'system', voiceId: 'Aman', speed: 1 }, echo: 'speakers' }
const START = { mode: 'practice', jobId: 'job-1', interviewType: 'technical', consent: null, interview: PLAN }
const reply = (system: string): string => /Check an interview answer/.test(system) ? '{}' : JSON.stringify({ criteria: [{ criterion: 'Structure', score: 4, evidence: '' }] })

function setup(over: Partial<CopilotDeps> = {}) {
  const base = fs.mkdtempSync(path.join(dir, 'c-'))
  const recordStats = vi.fn()
  const deps: CopilotDeps = {
    dir: () => base, now: () => 2_000_000_000_000, job: id => ({ id, title: 'Platform Engineer', company: 'Northwind', report: null, posting: null }), cv: () => '# Ada\n',
    permission: () => 'granted', hasKey: () => true, sttInstalled: () => true,
    call: async () => ({ text: JSON.stringify({ structure: 4, specifics: 4, evidence: 4, concision: 4, notes: [] }), tokens: 1, model: 'fake' }),
    complete: async system => reply(system),
    interviewer: { pool: () => ({ items: GOLDEN_POOL, skills: GOLDEN_SKILLS }), recordStats },
    ...over,
  }
  return { c: createCopilot(deps), recordStats, base }
}
const questions = () => sent.filter(s => s[0] === 'careerloom:copilotQuestion').map(s => (s[1] as { id: string; text: string }))
const typed = (c: ReturnType<typeof setup>['c'], text: string) => c.handlers.copilotOverlay({ typed: text })

describe('copilotStart with an interview plan', () => {
  it('asks a warm-up question first and accepts typed answers', async () => {
    const { c } = setup()
    await c.handlers.copilotStart(START)
    expect(questions()[0]!.id).toBe('warmup')
    await typed(c, 'I work on platform tooling'); await vi.waitFor(() => expect(questions()).toHaveLength(2))
    expect(questions()[1]!.id).not.toBe('warmup')
    await c.handlers.copilotStop('user')
  })

  it('stores the interview record and per-question results on the session, writes stats back', async () => {
    const { c, recordStats, base } = setup()
    const { sessionId } = await c.handlers.copilotStart(START) as { sessionId: string }
    await typed(c, 'hello'); await vi.waitFor(() => expect(questions()).toHaveLength(2))
    await typed(c, 'I fixed the pipeline and cut deploys from 20 to 8 minutes'); await vi.waitFor(() => expect(questions()).toHaveLength(3))
    await c.handlers.copilotStop('user')
    const d = await c.handlers.copilotGetSession(sessionId) as SessionDetail
    expect(d.interview?.perQuestion).toHaveLength(1)
    expect(d.interview?.perQuestion[0]).toMatchObject({ score: 4, skipped: false })
    expect(d.interview?.itemIds).toHaveLength(2)
    expect(d.transcript.filter(l => l.speaker === 'you')).toHaveLength(2) // typed lines are recorded
    expect(recordStats).toHaveBeenCalledTimes(1)
    expect(fs.readdirSync(path.join(base, 'skill-signal'))).toHaveLength(1)
  })

  it('records typed lines when speech recognition runs too (nothing else records them)', async () => {
    const { c } = setup({ session: { start: async () => undefined, stop: async () => undefined } })
    const { sessionId } = await c.handlers.copilotStart(START) as { sessionId: string }
    await typed(c, 'hello'); await vi.waitFor(() => expect(questions()).toHaveLength(2))
    await c.handlers.copilotStop('user')
    expect(((await c.handlers.copilotGetSession(sessionId)) as SessionDetail).transcript.filter(l => l.speaker === 'you').map(l => l.text)).toEqual(['hello'])
    expect(sent.some(s => s[0] === 'careerloom:copilotTranscript' && (s[1] as { text: string }).text === 'hello')).toBe(true)
  })

  it('overlay controls reach the interviewer: hint reveals a rubric cue, skip moves on', async () => {
    const { c } = setup()
    await c.handlers.copilotStart(START)
    await typed(c, 'hi'); await vi.waitFor(() => expect(questions()).toHaveLength(2))
    await c.handlers.copilotOverlay({ interviewer: 'hint' })
    expect(sent.some(s => s[0] === 'careerloom:copilotTranscript' && /^Hint:/.test((s[1] as { text: string }).text))).toBe(true)
    await c.handlers.copilotOverlay({ interviewer: 'skip' }); await vi.waitFor(() => expect(questions()).toHaveLength(3))
    await c.handlers.copilotStop('user')
  })

  it('refuses a job with no question base before anything is saved, with a next step', async () => {
    const { c } = setup({ interviewer: { pool: () => null } })
    await expect(c.handlers.copilotStart(START)).rejects.toThrow(/Knowledge base|report questions/)
    expect(await c.handlers.copilotListSessions()).toEqual([])
  })

  it('rejects a malformed plan and a plan on a live session', async () => {
    const { c } = setup()
    await expect(c.handlers.copilotStart({ ...START, interview: { ...PLAN, mode: 'nope' } })).rejects.toThrow(/mode/)
    await expect(c.handlers.copilotStart({ ...START, mode: 'live' })).rejects.toThrow()
  })

  it('without a plan the report-question path is unchanged', async () => {
    const { c } = setup()
    await c.handlers.copilotStart({ mode: 'practice', jobId: 'job-1', interviewType: 'mixed', consent: null })
    expect(questions()[0]!.id).toMatch(/^q-/)
    await c.handlers.copilotStop('user')
  })

  it('overlay commands are validated; typed text outside an interview is ignored', async () => {
    const { c } = setup()
    await expect(c.handlers.copilotOverlay({ interviewer: 'explode' })).rejects.toThrow()
    await expect(c.handlers.copilotOverlay({ typed: 'x'.repeat(2001) })).rejects.toThrow()
    await expect(typed(c, 'nobody is listening')).resolves.toBeUndefined()
  })
})
