import { describe, expect, it } from 'vitest'

import type { KbItemView } from '../../../electron/kb/types'
import { applyFilter, isFiltered, NO_FILTER, sortItems } from './filter'

const mk = (id: string, o: Partial<KbItemView> & { pinned?: boolean; hidden?: boolean } = {}): KbItemView => ({
  id, text: `question ${id}`, type: 'technical', skills: ['kafka'], difficulty: 3, provenance: 'sourced', seen: 1, confidence: 0.8, idealOutline: [], rubric: [], followUps: [], redFlags: [],
  user: { pinned: o.pinned ?? false, hidden: o.hidden ?? false, edited: false, notes: null }, stats: { asked: 0, lastScore: null, avgScore: null }, sourceCount: 1, whyForYou: null, ...o,
})

describe('kb filter', () => {
  const all = [mk('a'), mk('b', { type: 'behavioural', provenance: 'generated', difficulty: 1 }), mk('c', { skills: ['go'], difficulty: 5, hidden: true })]
  it('hides hidden items unless asked', () => {
    expect(applyFilter(all, NO_FILTER, false).map(i => i.id)).toEqual(['a', 'b'])
    expect(applyFilter(all, NO_FILTER, true)).toHaveLength(3)
  })
  it('combines type, skill, difficulty band, origin and text', () => {
    expect(applyFilter(all, { ...NO_FILTER, type: 'behavioural' }, true).map(i => i.id)).toEqual(['b'])
    expect(applyFilter(all, { ...NO_FILTER, skill: 'go' }, true).map(i => i.id)).toEqual(['c'])
    expect(applyFilter(all, { ...NO_FILTER, difficulty: 'hard' }, true).map(i => i.id)).toEqual(['c'])
    expect(applyFilter(all, { ...NO_FILTER, hideGenerated: true }, true).map(i => i.id)).toEqual(['a', 'c'])
    expect(applyFilter(all, { ...NO_FILTER, text: ' QUESTION b ' }, true).map(i => i.id)).toEqual(['b'])
  })
  it('sorts pinned first, then by column, stable', () => {
    const items = [mk('a', { difficulty: 4 }), mk('b', { difficulty: 2 }), mk('c', { difficulty: 4, pinned: true }), mk('d', { difficulty: 2 })]
    expect(sortItems(items, 'default', 1).map(i => i.id)).toEqual(['c', 'a', 'b', 'd'])
    expect(sortItems(items, 'level', 1).map(i => i.id)).toEqual(['c', 'b', 'd', 'a'])
    expect(sortItems(items, 'level', -1).map(i => i.id)).toEqual(['c', 'a', 'b', 'd'])
  })
  it('knows when a filter is active', () => {
    expect(isFiltered(NO_FILTER)).toBe(false)
    expect(isFiltered({ ...NO_FILTER, text: 'x' })).toBe(true)
  })
})
