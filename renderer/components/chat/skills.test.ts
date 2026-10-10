// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import type { InstalledSkill } from '../../../electron/skills/types'
import { filterSkills, listEnabledSkills, slashQuery } from './skills'

const s = (id: string, name: string, description: string): InstalledSkill => ({ id, name, description, version: null, source: { kind: 'folder', path: '/x' }, hash: '', path: '', enabled: true, installedAt: '', sizeBytes: 0, hasScripts: false, provides: [] })

describe('slashQuery', () => {
  it('finds a /token right before the caret', () => {
    expect(slashQuery('/res', 4)).toEqual({ query: 'res', start: 0 })
    expect(slashQuery('help /cov', 9)).toEqual({ query: 'cov', start: 5 })
    expect(slashQuery('/', 1)).toEqual({ query: '', start: 0 })
  })
  it('ignores slashes inside words, paths and earlier text', () => {
    expect(slashQuery('and/or', 6)).toBeNull()
    expect(slashQuery('see ~/docs/cv', 13)).toBeNull()
    expect(slashQuery('/res now', 8)).toBeNull()
    expect(slashQuery('/res', 2)).toEqual({ query: 'r', start: 0 })
  })
})

describe('filterSkills', () => {
  const all = [s('a', 'Cover letter', 'drafts'), s('b', 'Resume tailor', 'rewrites a cover page'), s('c', 'Salary', 'research pay')]
  it('returns all for an empty query', () => expect(filterSkills(all, '')).toHaveLength(3))
  it('ranks name matches before description matches', () => expect(filterSkills(all, 'cover').map(x => x.id)).toEqual(['a', 'b']))
  it('drops non-matches', () => expect(filterSkills(all, 'zzz')).toEqual([]))
})

describe('listEnabledSkills', () => {
  it('is empty, not an error, while the skills bridge is absent', async () => {
    await expect(listEnabledSkills()).resolves.toEqual([])
  })
})
