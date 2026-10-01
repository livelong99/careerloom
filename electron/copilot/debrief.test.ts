// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { applyDebrief, parseScorecard, scoreSession, sessionScore } from './debrief'
import { openSessionStore } from './store'
import type { SessionDetail } from './types'

const CV = '# Ada\n\n## Experience\n- Led migration of 40 services to Kubernetes at Northwind\n- Cut p99 latency by 35%\n'
let dir: string
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-debrief-')) })

const session = (over: Partial<SessionDetail> = {}): SessionDetail => ({
  id: 's1', startedAt: 1, endedAt: 9, mode: 'practice', jobId: 'job-1', jobTitle: 'Senior Platform Engineer', company: 'Northwind Labs', questions: 1, durationSec: 60, score: null,
  transcript: [
    { id: 't0', speaker: 'interviewer', text: 'Tell me about a migration.', final: true, t0: 0, t1: 1 },
    { id: 't1', speaker: 'you', text: 'We moved forty services to Kubernetes and cut latency.', final: true, t0: 1, t1: 5 },
  ],
  questionsList: [{ id: 'q1', text: 'Tell me about a migration.', type: 'behavioural', confidence: 1, at: 0, auto: false }],
  suggestions: [], scorecard: null, ...over,
})

describe('parseScorecard', () => {
  const ok = { structure: 4, specifics: 3.5, evidence: 2, concision: 5, notes: [{ questionId: 'q1', tip: 'Lead with the result.', suggestedLine: 'Led migration of 40 services to Kubernetes.' }] }
  it('accepts JSON (fenced or bare) and clamps dimensions to 1..5', () => {
    const c = parseScorecard('```json\n' + JSON.stringify({ ...ok, structure: 9, concision: 0 }) + '\n```', CV, ['q1'])
    expect(c).toMatchObject({ structure: 5, concision: 1, specifics: 3.5 })
  })
  it('drops notes for unknown questions and suggested lines that invent numbers', () => {
    const c = parseScorecard(JSON.stringify({ ...ok, notes: [
      { questionId: 'q1', tip: 't', suggestedLine: 'Led migration of 400 services.' },
      { questionId: 'nope', tip: 'x', suggestedLine: null },
    ] }), CV, ['q1'])!
    expect(c.notes).toHaveLength(1)
    expect(c.notes[0]!.suggestedLine).toBeNull()
  })
  it('keeps a suggested line that only rephrases the résumé', () => {
    expect(parseScorecard(JSON.stringify(ok), CV, ['q1'])!.notes[0]!.suggestedLine).toBe('Led migration of 40 services to Kubernetes.')
  })
  it('returns null for unparseable output', () => {
    expect(parseScorecard('not json', CV, [])).toBeNull()
    expect(parseScorecard(JSON.stringify({ structure: 'x' }), CV, [])).toBeNull()
  })
})

describe('sessionScore', () => {
  it('is the mean of the four dimensions, one decimal', () => {
    expect(sessionScore({ structure: 4, specifics: 3, evidence: 3, concision: 4 })).toBe(3.5)
  })
})

describe('scoreSession (text-only model call)', () => {
  it('stores the scorecard and session score; the prompt carries Q and A text but no résumé-free numbers', async () => {
    const store = openSessionStore(dir); store.save(session())
    const call = vi.fn().mockResolvedValue({ text: JSON.stringify({ structure: 4, specifics: 4, evidence: 3, concision: 5, notes: [] }), tokens: 10, model: 'cheap' })
    const card = await scoreSession({ store, call, cv: () => CV }, 's1')
    expect(card?.structure).toBe(4)
    expect(store.get('s1')?.scorecard).not.toBeNull()
    expect(store.list()[0]!.score).toBe(4)
    expect(call.mock.calls[0]![0]).toContain('Tell me about a migration.')
    expect(call.mock.calls[0]![0]).toContain('We moved forty services')
  })
  it('skips sessions with no spoken answers and never calls the model', async () => {
    const store = openSessionStore(dir); store.save(session({ transcript: [] }))
    const call = vi.fn()
    expect(await scoreSession({ store, call, cv: () => CV }, 's1')).toBeNull()
    expect(call).not.toHaveBeenCalled()
  })
  it('a model failure leaves the session unscored and rethrows nothing', async () => {
    const store = openSessionStore(dir); store.save(session())
    expect(await scoreSession({ store, call: () => Promise.reject(new Error('runner down')), cv: () => CV }, 's1')).toBeNull()
    expect(store.get('s1')?.scorecard).toBeNull()
  })
})

describe('applyDebrief (explicit only)', () => {
  const card = { structure: 4, specifics: 4, evidence: 3, concision: 4, notes: [{ questionId: 'q1', tip: 'Lead with the result.', suggestedLine: 'Led migration of 40 services to Kubernetes.' }] }
  it('job-note appends a dated note for the job and is idempotent', async () => {
    const store = openSessionStore(dir); store.save(session({ scorecard: card }))
    expect(await applyDebrief({ store, cv: () => CV, dir }, 's1', 'q1', 'job-note')).toEqual({ ok: true })
    await applyDebrief({ store, cv: () => CV, dir }, 's1', 'q1', 'job-note')
    const files = fs.readdirSync(path.join(dir, 'notes'))
    expect(files).toHaveLength(1)
    const text = fs.readFileSync(path.join(dir, 'notes', files[0]!), 'utf8')
    expect(text).toContain('Lead with the result.')
    expect(text.match(/Lead with the result\./g)).toHaveLength(1)
  })
  it('resume-bullet stages the line (never writes cv.md) and only if it passes the fact check', async () => {
    const store = openSessionStore(dir); store.save(session({ scorecard: card }))
    expect(await applyDebrief({ store, cv: () => CV, dir }, 's1', 'q1', 'resume-bullet')).toEqual({ ok: true })
    const staged = JSON.parse(fs.readFileSync(path.join(dir, 'bullets.json'), 'utf8')) as Array<{ text: string; jobId: string }>
    expect(staged).toEqual([expect.objectContaining({ text: 'Led migration of 40 services to Kubernetes.', jobId: 'job-1' })])
    const bad = { ...card, notes: [{ questionId: 'q1', tip: 't', suggestedLine: 'Led migration of 900 services.' }] }
    store.save(session({ scorecard: bad }))
    expect(await applyDebrief({ store, cv: () => CV, dir }, 's1', 'q1', 'resume-bullet')).toEqual({ ok: false })
  })
  it('fails cleanly for a missing session, question or scorecard', async () => {
    const store = openSessionStore(dir); store.save(session())
    expect(await applyDebrief({ store, cv: () => CV, dir }, 'nope', 'q1', 'job-note')).toEqual({ ok: false })
    expect(await applyDebrief({ store, cv: () => CV, dir }, 's1', 'q1', 'job-note')).toEqual({ ok: false })
  })
})

describe('scoreSession with an interviewer record', () => {
  it('passes the per-question rubric scores to the model so tips target the weakest criterion', async () => {
    const store = openSessionStore(dir)
    store.save(session({ interview: { planHash: 'abc', itemIds: ['q1'], perQuestion: [{ itemId: 'q1', score: 2.5, hintUsed: false, skipped: false, criteria: [{ criterion: 'Concrete result', score: 1, evidence: '' }] }] } }))
    const call = vi.fn(async (_p: string) => ({ text: JSON.stringify({ structure: 3, specifics: 3, evidence: 3, concision: 3, notes: [] }), tokens: 1, model: 'm' }))
    await scoreSession({ store, call, cv: () => CV }, 's1')
    expect(call.mock.calls[0]![0]).toMatch(/\[q1\] 2\.5 \(Concrete result\)/)
  })
  it('a session without an interviewer record has no such section', async () => {
    const store = openSessionStore(dir)
    store.save(session())
    const call = vi.fn(async (_p: string) => ({ text: '{}', tokens: 1, model: 'm' }))
    await scoreSession({ store, call, cv: () => CV }, 's1')
    expect(call.mock.calls[0]![0]).not.toMatch(/AI interviewer already scored/)
  })
})
