// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { beforeEach, describe, expect, it } from 'vitest'

import { createRecorder, openSessionStore, type SessionStore } from './store'
import type { ConsentRecord, SessionDetail } from './types'

const DAY = 86_400_000
const NOW = 1_800_000_000_000
let dir: string
let store: SessionStore
beforeEach(() => { dir = fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-store-')); store = openSessionStore(dir) })

const detail = (id: string, over: Partial<SessionDetail> = {}): SessionDetail => ({
  id, startedAt: NOW - DAY, endedAt: NOW - DAY + 60_000, mode: 'practice', jobId: 'job-1', jobTitle: 'Senior Platform Engineer', company: 'Northwind Labs',
  questions: 1, durationSec: 60, score: 3.5,
  transcript: [{ id: 't1', speaker: 'interviewer', text: 'Tell me about a migration.', final: true, t0: 0, t1: 2 }],
  questionsList: [{ id: 'q1', text: 'Tell me about a migration.', type: 'behavioural', confidence: 0.9, at: 0, auto: false }],
  suggestions: [], scorecard: null, ...over,
})

describe('session store', () => {
  it('rejects a session without a jobId', () => {
    expect(() => store.save(detail('a', { jobId: '' }))).toThrow(/job/i)
    expect(store.list()).toEqual([])
  })
  it('round-trips a session and lists summaries without transcript text', () => {
    store.save(detail('a'))
    expect(store.get('a')?.transcript).toHaveLength(1)
    const [row] = store.list()
    expect(row).toMatchObject({ id: 'a', jobId: 'job-1', company: 'Northwind Labs' })
    expect('transcript' in row!).toBe(false)
  })
  it('keeps two sessions per Job and filters by job', () => {
    store.save(detail('a', { startedAt: NOW - 2 * DAY })); store.save(detail('b')); store.save(detail('c', { jobId: 'job-2' }))
    expect(store.list({ jobId: 'job-1' }).map(s => s.id).sort()).toEqual(['a', 'b'])
    expect(store.list({ jobId: 'job-2' })).toHaveLength(1)
  })
  it('lists newest first', () => {
    store.save(detail('old', { startedAt: NOW - 5 * DAY })); store.save(detail('new', { startedAt: NOW - DAY }))
    expect(store.list().map(s => s.id)).toEqual(['new', 'old'])
  })
  it('writes session files with mode 0600', () => {
    store.save(detail('a'))
    expect(fs.statSync(path.join(dir, 'sessions', 'a.json')).mode & 0o777).toBe(0o600)
  })
  it('rebuilds the index from session files when it is missing or corrupt', () => {
    store.save(detail('a')); store.save(detail('b'))
    fs.writeFileSync(path.join(dir, 'index.json'), '{not json')
    expect(openSessionStore(dir).list().map(s => s.id).sort()).toEqual(['a', 'b'])
    fs.rmSync(path.join(dir, 'index.json'))
    expect(openSessionStore(dir).list()).toHaveLength(2)
  })
  it('removes one session or all, returning the count', () => {
    store.save(detail('a')); store.save(detail('b'))
    expect(store.remove('a')).toBe(1)
    expect(store.get('a')).toBeNull()
    expect(store.remove('all')).toBe(1)
    expect(store.list()).toEqual([])
    expect(store.remove('missing')).toBe(0)
  })
  it('rejects path-traversal ids', () => {
    expect(() => store.get('../x')).toThrow()
    expect(() => store.remove('../x')).toThrow()
  })
  it('keeps the session (title/company snapshot) when the Job is deleted: nothing depends on the job list', () => {
    store.save(detail('a'))
    expect(store.get('a')).toMatchObject({ jobTitle: 'Senior Platform Engineer', company: 'Northwind Labs', jobId: 'job-1' })
  })
  it('scores trend by job, oldest first', () => {
    store.save(detail('a', { startedAt: NOW - 3 * DAY, score: 2 })); store.save(detail('b', { startedAt: NOW - DAY, score: null })); store.save(detail('c', { jobId: 'j2' }))
    expect(store.trend('job-1')).toEqual([{ sessionId: 'a', at: NOW - 3 * DAY, score: 2 }, { sessionId: 'b', at: NOW - DAY, score: null }])
  })
})

describe('retention sweep', () => {
  it('null keeps everything', () => {
    store.save(detail('a', { endedAt: NOW - 400 * DAY, startedAt: NOW - 400 * DAY }))
    expect(store.sweep(null, NOW)).toBe(0)
    expect(store.get('a')?.transcript).toHaveLength(1)
  })
  it('N days removes transcript text of older sessions but keeps the summary, scorecard and suggestions', () => {
    store.save(detail('old', { startedAt: NOW - 100 * DAY, endedAt: NOW - 100 * DAY + 1000, scorecard: { structure: 3, specifics: 3, evidence: 3, concision: 3, notes: [] } }))
    store.save(detail('fresh', { startedAt: NOW - 10 * DAY, endedAt: NOW - 10 * DAY + 1000 }))
    expect(store.sweep(90, NOW)).toBe(1)
    const old = store.get('old')!
    expect(old.transcript).toEqual([])
    expect(old.questionsList.every(q => q.text === '')).toBe(true)
    expect(old.scorecard).not.toBeNull()
    expect(store.list().map(s => s.id).sort()).toEqual(['fresh', 'old'])
    expect(store.get('fresh')?.transcript).toHaveLength(1)
  })
  it('is idempotent: a swept session is not counted again', () => {
    store.save(detail('old', { startedAt: NOW - 100 * DAY, endedAt: NOW - 100 * DAY }))
    expect(store.sweep(90, NOW)).toBe(1)
    expect(store.sweep(90, NOW)).toBe(0)
  })
  it('0 removes the text of every ended session immediately, but not one still running', () => {
    store.save(detail('done')); store.save(detail('running', { endedAt: null }))
    expect(store.sweep(0, NOW)).toBe(1)
    expect(store.get('done')?.transcript).toEqual([])
    expect(store.get('running')?.transcript).toHaveLength(1)
  })
  it('also clears the generated answers and debrief tips (they echo the conversation) but keeps scores and cost', () => {
    const sug = { questionId: 'q1', model: 'm', tier: 'fast' as const, say: 'Tell them about the migration', bullets: ['40 services'], star: { s: 's', t: 't', a: 'a', r: 'r' }, proof: [{ quote: 'Led migration', source: 'cv' }], flags: [], done: true, firstTokenMs: 10, totalMs: 50, costUsd: 0.002 }
    store.save(detail('old', { startedAt: NOW - 100 * DAY, endedAt: NOW - 100 * DAY, transcript: [], questionsList: [], suggestions: [sug], scorecard: { structure: 3, specifics: 3, evidence: 3, concision: 3, notes: [{ questionId: 'q1', tip: 'You said X', suggestedLine: 'Try Y' }] } }))
    expect(store.expiring(90, NOW)).toBe(1)
    expect(store.sweep(90, NOW)).toBe(1)
    const old = store.get('old')!
    expect(old.suggestions).toEqual([{ ...sug, say: '', bullets: [], star: null, proof: [] }])
    expect(old.scorecard).toEqual({ structure: 3, specifics: 3, evidence: 3, concision: 3, notes: [] })
    expect(store.sweep(90, NOW)).toBe(0)
  })
  it('counts how many sessions a lower value would newly affect without deleting', () => {
    store.save(detail('a', { startedAt: NOW - 50 * DAY, endedAt: NOW - 50 * DAY })); store.save(detail('b', { startedAt: NOW - 10 * DAY, endedAt: NOW - 10 * DAY }))
    expect(store.expiring(30, NOW)).toBe(1)
    expect(store.expiring(5, NOW)).toBe(2)
    expect(store.expiring(null, NOW)).toBe(0)
    expect(store.get('a')?.transcript).toHaveLength(1)
  })
})

describe('stray files', () => {
  it('a file in sessions/ that is not a session id does not break listing', () => {
    store.save(detail('a'))
    fs.writeFileSync(path.join(dir, 'sessions', 'a.b.json'), '{}')
    fs.rmSync(path.join(dir, 'index.json'))
    expect(openSessionStore(dir).list().map(x => x.id)).toEqual(['a'])
  })
})

describe('consent records', () => {
  const rec = (id: string): ConsentRecord => ({ id, sessionId: 's', at: NOW, textVersion: 'v1', aiAllowedConfirmed: true, everyoneInformedConfirmed: true, jurisdiction: 'DE', sources: ['mic'], sttProvider: 'moonshine', llmProvider: 'openrouter', transcriptSaved: true, privacyMode: false, indicator: 'chip' })
  it('appends to consent.jsonl (0600) and lists in order; survives session deletion', () => {
    store.appendConsent(rec('1')); store.appendConsent(rec('2'))
    expect(store.consents().map(c => c.id)).toEqual(['1', '2'])
    store.remove('all')
    expect(store.consents()).toHaveLength(2)
    expect(fs.statSync(path.join(dir, 'consent.jsonl')).mode & 0o777).toBe(0o600)
  })
  it('skips corrupt lines', () => {
    store.appendConsent(rec('1'))
    fs.appendFileSync(path.join(dir, 'consent.jsonl'), 'garbage\n')
    expect(store.consents()).toHaveLength(1)
  })
})

describe('recorder (accumulates the live/practice session, persists on begin, question and end)', () => {
  const meta = { id: 'r1', mode: 'live' as const, jobId: 'job-1', jobTitle: 'Senior Platform Engineer', company: 'Northwind Labs' }
  it('saves an open session at begin, upserts partial lines by id, and closes with counts and duration', () => {
    let t = NOW
    const rec = createRecorder(store, () => t)
    rec.begin(meta)
    expect(store.get('r1')?.endedAt).toBeNull()
    rec.line({ id: 'l1', speaker: 'interviewer', text: 'Tell me', final: false, t0: 0, t1: null })
    rec.line({ id: 'l1', speaker: 'interviewer', text: 'Tell me about X?', final: true, t0: 0, t1: 2 })
    rec.question({ id: 'q1', text: 'Tell me about X?', type: 'behavioural', confidence: 0.9, at: 0, auto: false })
    rec.suggestion({ questionId: 'q1', model: 'm', tier: 'fast', say: 'a', bullets: [], star: null, proof: [], flags: [], done: false, firstTokenMs: 1, totalMs: null, costUsd: null })
    rec.suggestion({ questionId: 'q1', model: 'm', tier: 'fast', say: 'ab', bullets: [], star: null, proof: [], flags: [], done: true, firstTokenMs: 1, totalMs: 9, costUsd: 0.01 })
    t = NOW + 65_000
    const d = rec.end()!
    expect(d).toMatchObject({ id: 'r1', endedAt: NOW + 65_000, durationSec: 65, questions: 1 })
    expect(d.transcript).toHaveLength(1)
    expect(d.transcript[0]!.text).toBe('Tell me about X?')
    expect(d.suggestions).toHaveLength(1)
    expect(d.suggestions[0]!.say).toBe('ab')
    expect(store.get('r1')?.endedAt).toBe(NOW + 65_000)
    expect(rec.active()).toBeNull()
  })
  it('refuses to begin without a job and ignores events when nothing is recording', () => {
    const rec = createRecorder(store)
    expect(() => rec.begin({ ...meta, jobId: '' })).toThrow(/job/i)
    rec.line({ id: 'x', speaker: 'you', text: 'hi', final: true, t0: 0, t1: 1 })
    expect(rec.end()).toBeNull()
  })
})
