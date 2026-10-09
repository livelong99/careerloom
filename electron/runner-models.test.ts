import { describe, expect, it } from 'vitest'
import { CLAUDE_ALIASES, claudeModels, parseCodexCache } from './runner-models'

describe('runner model lists', () => {
  it('codex: listed models first, hidden ones labelled, junk ignored', () => {
    const out = parseCodexCache({ models: [{ slug: 'b', display_name: 'B', visibility: 'hide' }, { slug: 'a', display_name: 'A', visibility: 'list' }, { nope: 1 }] })
    expect(out).toEqual([{ id: 'a', label: 'A' }, { id: 'b', label: 'B (hidden)' }])
    expect(parseCodexCache(null)).toEqual([])
  })
  it('claude: aliases first, API ids appended without duplicates, API failure keeps aliases', async () => {
    expect((await claudeModels(async () => ['sonnet', 'claude-x'])).map(m => m.id)).toEqual([...CLAUDE_ALIASES.map(a => a.id), 'claude-x'])
    expect(await claudeModels(async () => { throw new Error('offline') })).toEqual(CLAUDE_ALIASES)
  })
})
