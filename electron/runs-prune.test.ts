import { describe, expect, it } from 'vitest'

import { dropRunLines } from './runs-prune'

const line = (id: string) => JSON.stringify({ id, status: 'done' })

describe('dropRunLines', () => {
  it('removes only the named runs and reports the ids it removed', () => {
    const { text, removed } = dropRunLines([line('a'), line('b'), line('c')].join('\n') + '\n', new Set(['b', 'zzz']))
    expect(removed).toEqual(['b'])
    expect(text).toBe(`${line('a')}\n${line('c')}\n`)
  })
  it('keeps lines it cannot parse', () => {
    expect(dropRunLines('not json\n' + line('a') + '\n', new Set(['a'])).text).toBe('not json\n')
  })
  it('is a no-op for an empty set', () => expect(dropRunLines(line('a') + '\n', new Set()).removed).toEqual([]))
})
