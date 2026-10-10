// @vitest-environment node
import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { TranscriptLine } from '../copilot/types'
import { GOLDEN_POOL, GOLDEN_SKILLS } from './fixtures/golden-kb'
import { scripted } from './fixtures/scripted-llm'
import { parsePlan } from './plan'
import { createInterview, NO_BASE, writeSkillSignal } from './session'

const plan = parsePlan({ mode: 'technical', minutes: 8, focusSkills: [], difficulty: 'adaptive', includeGenerated: true, persona: { style: 's', seniority: 'senior', strictness: 1, name: 'A' }, voice: { engine: 'system', voiceId: 'Aman', speed: 1 }, echo: 'speakers' })
const llm = () => scripted([{ when: /Check an interview answer/, reply: '{}' }, { when: /score one spoken/i, reply: JSON.stringify({ criteria: [{ criterion: 'x', score: 4, evidence: '' }] }) }])
const you = (t: string, i: number): TranscriptLine => ({ id: `y${i}`, speaker: 'you', text: t, final: true, t0: 1, t1: 2 })

describe('createInterview', () => {
  const mk = (pool: ReturnType<typeof Object> | null = { items: GOLDEN_POOL, skills: GOLDEN_SKILLS }, extra = {}) => {
    const qs: string[] = []
    const recordStats = vi.fn()
    const iv = createInterview({ jobId: 'job-1', sessionId: 'S', plan, deps: { pool: () => pool as never, recordStats, ...extra }, sink: { question: q => void qs.push(q.id), line: () => undefined, done: () => undefined }, complete: llm(), answerMs: 60_000, now: () => 1000 })
    return { iv, qs, recordStats }
  }
  it('refuses a job with no question base, with an actionable message', () => {
    expect(() => mk(null)).toThrow(NO_BASE)
    expect(() => mk({ items: [], skills: [] })).toThrow(NO_BASE)
  })
  it('records the plan hash, asked item ids and per-question results; writes stats back', async () => {
    const { iv, qs, recordStats } = mk()
    iv.runner.start()
    await iv.runner.feed(you('hello', 1), true); await vi.waitFor(() => expect(qs).toHaveLength(2))
    await iv.runner.feed(you('my answer', 2), true); await vi.waitFor(() => expect(qs).toHaveLength(3))
    const rec = iv.record()
    expect(rec.planHash).toMatch(/^[0-9a-f]{12}$/)
    expect(rec.itemIds).toEqual([qs[1], qs[2]])
    expect(rec.perQuestion).toHaveLength(1)
    expect(recordStats).toHaveBeenCalledWith('job-1', qs[1], expect.objectContaining({ asked: 1, lastScore: 4 }))
    expect(Object.keys(iv.skillSignal().skills).length).toBeGreaterThan(0)
  })
  it('a failing stats store never breaks the session', async () => {
    const { iv, qs } = mk(undefined, { recordStats: () => { throw new Error('disk') } })
    iv.runner.start()
    await iv.runner.feed(you('hello', 1), true); await vi.waitFor(() => expect(qs).toHaveLength(2))
    await iv.runner.feed(you('ans', 2), true)
    await vi.waitFor(() => expect(qs).toHaveLength(3))
  })
  it('a hint and a skip are recorded on the question', async () => {
    const { iv, qs } = mk()
    iv.runner.start()
    await iv.runner.feed(you('hello', 1), true); await vi.waitFor(() => expect(qs).toHaveLength(2))
    iv.runner.hint(); iv.runner.skip()
    await vi.waitFor(() => expect(qs).toHaveLength(3))
    expect(iv.record().perQuestion[0]).toMatchObject({ skipped: true, hintUsed: true })
  })
})

describe('writeSkillSignal', () => {
  it('writes one small file per job, atomically, owner-only; empty signals write nothing', () => {
    const dir = mkdtempSync(join(tmpdir(), 'sig-'))
    writeSkillSignal(dir, { jobId: 'j', at: 1, skills: {} })
    expect(readdirSync(dir)).toEqual([])
    writeSkillSignal(dir, { jobId: 'j', at: 1, skills: { py: { avg: 3.5, n: 2 } } })
    const f = readdirSync(join(dir, 'skill-signal'))
    expect(f).toHaveLength(1)
    expect(JSON.parse(readFileSync(join(dir, 'skill-signal', f[0]!), 'utf8')).skills.py.avg).toBe(3.5)
  })
})
