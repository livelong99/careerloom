// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { makeItem } from './fixtures/golden'
import { LIMITS, parseItem, parseNotes } from './schema-guard'

describe('schema guard', () => {
  it('accepts a valid item unchanged and recomputes the id from the text', () => {
    const it0 = makeItem('Valid question here')
    expect(parseItem(it0)).toEqual(it0)
    expect(parseItem({ ...it0, id: 'forged' })!.id).toBe(it0.id)
  })
  it.each([null, 5, 'x', [], {}, { text: '' }, { text: 5 }, { text: '   ' }])('rejects %j', raw => expect(parseItem(raw)).toBeNull())
  it('clamps lengths, enums, numbers and array sizes instead of trusting them', () => {
    const p = parseItem({ text: 'q'.repeat(999), type: 'weird', difficulty: 99, confidence: 7, provenance: 'magic', skills: Array(50).fill('s'), idealOutline: Array(50).fill('o'.repeat(999)), seen: -3, stats: { asked: -1, lastScore: 9, avgScore: 'x' } })!
    expect(p.text).toHaveLength(LIMITS.text)
    expect(p).toMatchObject({ type: 'technical', difficulty: 5, confidence: 1, provenance: 'generated', seen: 1 })
    expect(p.skills.length).toBeLessThanOrEqual(LIMITS.list)
    expect(p.idealOutline.length).toBeLessThanOrEqual(LIMITS.list)
    expect(p.idealOutline[0]!.length).toBeLessThanOrEqual(LIMITS.line)
    expect(p.stats).toEqual({ asked: 0, lastScore: 5, avgScore: null })
  })
  it('notes: only string arrays, bounded', () => {
    expect(parseNotes({ company: ['a', 5, 'b'], role: 'x' })).toEqual({ company: ['a', 'b'], role: [], interviewerStyle: [], loop: [] })
  })
})
