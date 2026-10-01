// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { GOLDEN_POOL, GOLDEN_SKILLS } from './fixtures/golden-kb'
import { parsePlan, planHash, previewPlan } from './plan'

const good = { mode: 'mixed', minutes: 30, focusSkills: ['k8s'], difficulty: 'adaptive', includeGenerated: true, persona: { style: 'friendly', seniority: 'senior', strictness: 3, name: 'Asha' }, voice: { engine: 'system', voiceId: 'Aman', speed: 1 }, echo: 'speakers' }

describe('parsePlan', () => {
  it('accepts a valid plan and returns a fresh object', () => {
    const p = parsePlan(good)
    expect(p).toEqual(good); expect(p).not.toBe(good)
  })
  it('accepts open-ended minutes (null)', () => expect(parsePlan({ ...good, minutes: null }).minutes).toBeNull())
  it.each([
    ['unknown mode', { mode: 'nope' }], ['minutes out of range', { minutes: 0 }], ['minutes not a number', { minutes: '30' }],
    ['bad difficulty', { difficulty: 'x' }], ['includeGenerated missing', { includeGenerated: undefined }], ['bad engine', { voice: { engine: 'evil', voiceId: 'a', speed: 1 } }],
    ['speed out of range', { voice: { engine: 'system', voiceId: 'a', speed: 9 } }], ['strictness out of range', { persona: { ...good.persona, strictness: 9 } }],
    ['name too long', { persona: { ...good.persona, name: 'x'.repeat(41) } }], ['bad echo', { echo: 'both' }], ['focusSkills not strings', { focusSkills: [1] }],
    ['too many item ids', { itemIds: Array.from({ length: 101 }, (_, i) => `i${i}`) }], ['item id with path chars', { itemIds: ['../x'] }],
  ])('rejects %s', (_n, patch) => { expect(() => parsePlan({ ...good, ...patch })).toThrow() })
  it('rejects non-objects', () => { expect(() => parsePlan(null)).toThrow(); expect(() => parsePlan([])).toThrow() })
})

describe('planHash / previewPlan', () => {
  it('hash ignores voice and focus order but not mode', () => {
    const a = parsePlan(good)
    expect(planHash({ ...a, voice: { ...a.voice, speed: 1.2 } })).toBe(planHash(a))
    expect(planHash({ ...a, mode: 'technical' })).not.toBe(planHash(a))
  })
  it('previews question count, sourced count, cost and minutes from the selector', () => {
    const pr = previewPlan(GOLDEN_POOL, parsePlan(good), { skills: GOLDEN_SKILLS })
    expect(pr.questions).toBe(8)
    expect(pr.sourced).toBeLessThanOrEqual(pr.questions)
    expect(pr.usd).toBe(0.04); expect(pr.minutes).toBe(30)
    expect(previewPlan(GOLDEN_POOL, parsePlan({ ...good, voice: { ...good.voice, engine: 'openrouter' } })).usd).toBe(0.06)
  })
  it('a small pool yields fewer questions; no pool yields zero', () => {
    expect(previewPlan(GOLDEN_POOL.slice(0, 2), parsePlan({ ...good, mode: 'behavioural' })).questions).toBe(2)
    expect(previewPlan([], parsePlan(good)).questions).toBe(0)
  })
})
