import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
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
  it('ranks a label match above a keyword match', () => {
    expect(searchRegistry('retention')[0]?.label).toBe('Run-log retention')
    expect(searchRegistry('openrouter')[0]?.focus).toBe('key:openrouter')
  })
  it('every focus id is written somewhere under renderer/ (the live-DOM check is scripts/settings-qa/registry.mjs)', () => {
    const walk = (d: string): string[] => readdirSync(d).flatMap(f => { const p = join(d, f); return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(f) && !/\.test\./.test(f) && f !== 'settings-registry.ts' ? [readFileSync(p, 'utf8')] : [] })
    const src = walk(join(__dirname, '../..')).join('\n')
    const missing = REGISTRY.filter(e => e.focus && !src.includes(e.focus.includes(':') ? e.focus : `"${e.focus}"`) && !(e.focus.startsWith('integration:') || e.focus.startsWith('key:') || e.focus.startsWith('runner:') || e.focus.startsWith('clear-'))).map(e => e.focus)
    expect(missing).toEqual([])
  })
})
