// @vitest-environment node
import { describe, expect, it } from 'vitest'

import type { KbItem } from '../kb/types'
import { GOLDEN_POOL, GOLDEN_SKILLS } from './fixtures/golden-kb'
import { groupOf, nextDifficulty, questionBudget, selectNext } from './select'
import type { InterviewPlan, InterviewerState } from './types'

const plan = (over: Partial<InterviewPlan> = {}): InterviewPlan => ({
  mode: 'mixed', minutes: 30, focusSkills: [], difficulty: 'adaptive', includeGenerated: true,
  persona: { style: 'friendly', seniority: 'senior', strictness: 3, name: 'Asha' }, voice: { engine: 'system', voiceId: 'x', speed: 1 }, echo: 'speakers', ...over,
})
const state = (over: Partial<InterviewerState> = {}): InterviewerState => ({ sessionId: 's', seed: 'seed-1', phase: 'questions', asked: [], probes: 0, difficulty: 3, startedAt: 0, mix: {}, ...over })
const ctx = { skills: GOLDEN_SKILLS }

/** Drives the selector the way the runner does (asked + mix advance) for `n` questions. */
const run = (p: InterviewPlan, n: number, pool: KbItem[] = GOLDEN_POOL, seed = 'seed-1') => {
  let s = state({ seed })
  const out: KbItem[] = []
  for (let i = 0; i < n; i++) {
    const it = selectNext(pool, p, s, ctx)
    if (!it) break
    out.push(it)
    s = { ...s, asked: [...s.asked, it.id], mix: { ...s.mix, [it.type]: (s.mix[it.type] ?? 0) + 1 } }
  }
  return out
}

describe('selectNext', () => {
  it('is deterministic for a seed and varies across seeds', () => {
    const a = run(plan(), 8).map(i => i.id)
    expect(run(plan(), 8).map(i => i.id)).toEqual(a)
    expect(run(plan(), 8, GOLDEN_POOL, 'other-seed').map(i => i.id)).not.toEqual(a)
  })
  it('never repeats and never asks hidden items', () => {
    const ids = run(plan(), 30).map(i => i.id)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).not.toContain('h1')
  })
  it('a 30-minute mixed loop is about 3 behavioural : 4 technical : 1 design', () => {
    const picks = run(plan(), questionBudget(30))
    const g = (k: string) => picks.filter(i => groupOf(i.type) === k).length
    expect([g('behavioural'), g('technical'), g('design')]).toEqual([3, 4, 1])
  })
  it('includeGenerated=false drops generated items', () => {
    expect(run(plan({ includeGenerated: false }), 30).every(i => i.provenance !== 'generated')).toBe(true)
  })
  it('focus skills are asked first', () => {
    const first = run(plan({ mode: 'technical', focusSkills: ['k8s'] }), 3)
    expect(first.every(i => i.skills.includes('k8s'))).toBe(true)
  })
  it('CV-gap skills are boosted over covered ones', () => {
    const first = run(plan({ mode: 'technical' }), 2)
    expect(first.every(i => i.skills.includes('k8s'))).toBe(true)
  })
  it('pure modes only ask their own type', () => {
    expect(run(plan({ mode: 'behavioural' }), 10).every(i => groupOf(i.type) === 'behavioural')).toBe(true)
    expect(run(plan({ mode: 'system-design' }), 10).every(i => i.type === 'system-design')).toBe(true)
    expect(run(plan({ mode: 'coding' }), 10).every(i => i.type === 'coding')).toBe(true)
  })
  it('itemIds pins the session to those items', () => {
    const ids = run(plan({ itemIds: ['b1', 't1', 'zzz'] }), 10).map(i => i.id).sort()
    expect(ids).toEqual(['b1', 't1'])
  })
  it('novelty demotes recently asked items', () => {
    const fresh = selectNext(GOLDEN_POOL, plan({ mode: 'technical' }), state(), ctx)!
    const demoted = selectNext(GOLDEN_POOL, plan({ mode: 'technical' }), state(), { ...ctx, recent: new Set([fresh.id]) })!
    expect(demoted.id).not.toBe(fresh.id)
  })
  it('difficulty follows the state target', () => {
    const hard = selectNext(GOLDEN_POOL, plan({ mode: 'technical' }), state({ difficulty: 5 }), { skills: [] })!
    const easy = selectNext(GOLDEN_POOL, plan({ mode: 'technical' }), state({ difficulty: 1 }), { skills: [] })!
    expect(hard.difficulty).toBeGreaterThan(easy.difficulty)
  })
  it('returns null when nothing is eligible', () => {
    expect(selectNext([], plan(), state(), ctx)).toBeNull()
  })
})

describe('nextDifficulty / questionBudget', () => {
  it('+1 after two scores ≥ 4, −1 after two ≤ 2, clamped 1..5', () => {
    expect(nextDifficulty(3, [4, 5])).toBe(4)
    expect(nextDifficulty(3, [2, 1])).toBe(2)
    expect(nextDifficulty(5, [5, 5])).toBe(5)
    expect(nextDifficulty(1, [1, 1])).toBe(1)
    expect(nextDifficulty(3, [5, 3])).toBe(3)
    expect(nextDifficulty(3, [4])).toBe(3)
  })
  it('budget scales with minutes; open-ended is capped', () => {
    expect(questionBudget(30)).toBe(8)
    expect(questionBudget(15)).toBe(4)
    expect(questionBudget(null)).toBe(12)
  })
})
