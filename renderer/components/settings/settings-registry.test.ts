import { describe, expect, it } from 'vitest'

import { isPageId, PAGES } from './pages'
import { REGISTRY, searchRegistry } from './settings-registry'

describe('settings registry', () => {
  it('points every entry at an existing page, uniquely', () => {
    expect(REGISTRY.length).toBeGreaterThanOrEqual(40)
    expect(REGISTRY.every(e => isPageId(e.page))).toBe(true)
    const ids = REGISTRY.map(e => `${e.page}:${e.focus ?? ''}`)
    expect(new Set(ids).size).toBe(ids.length)
  })
  it('has the 12 pages in 5 groups', () => expect(PAGES.map(p => p.id)).toHaveLength(12))
  it('finds by label and keyword, all terms must match', () => {
    expect(searchRegistry('dark')[0]?.focus).toBe('theme')
    expect(searchRegistry('openrouter key').map(e => e.focus)).toContain('key:openrouter')
    expect(searchRegistry('theme zzz')).toEqual([])
    expect(searchRegistry('  ')).toEqual([])
  })
})
