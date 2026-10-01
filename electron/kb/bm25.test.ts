// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { buildIndex, scoreQuery, tokenize } from './bm25'

describe('tokenize', () => {
  it('keeps c++, c#, .net, node.js and drops stop-words', () => {
    expect(tokenize('We use C++, C# and .NET with Node.js')).toEqual(expect.arrayContaining(['c++', 'c#', '.net', 'node.js']))
    expect(tokenize('the of and to')).toEqual([])
  })
  it('strips light suffixes so inflections meet', () => {
    expect(tokenize('indexes')).toEqual(tokenize('index'))
    expect(tokenize('queries')).toEqual(tokenize('query'))
    expect(tokenize('rendering')).toEqual(tokenize('render'))
    expect(tokenize('failed')).toEqual(tokenize('fail'))
  })
  it('does not leak sentence dots into tokens', () => { expect(tokenize('end. ...start')).toEqual(['end', 'start']) })
})

describe('bm25', () => {
  const docs = [
    { id: 'a', fields: [{ text: 'kafka consumer ordering', boost: 3 }, { text: 'partition keys', boost: 1 }] },
    { id: 'b', fields: [{ text: 'postgres index', boost: 3 }, { text: 'kafka mention once', boost: 1 }] },
    { id: 'c', fields: [{ text: 'react rendering', boost: 3 }] },
  ]
  const index = buildIndex(docs)
  it('ranks the matching doc first, honours field boost, k and empty queries', () => {
    expect(scoreQuery(index, 'kafka ordering', 3)[0]!.id).toBe('a')
    expect(scoreQuery(index, 'kafka', 3).map(r => r.id)).toEqual(['a', 'b'])
    expect(scoreQuery(index, 'kafka', 1)).toHaveLength(1)
    expect(scoreQuery(index, 'the of', 3)).toEqual([])
    expect(scoreQuery(index, 'unseen-term', 3)).toEqual([])
    expect(index.size).toBe(3)
  })
  it('rarer terms score higher (idf) and results are deterministic on ties', () => {
    const idx = buildIndex([{ id: 'x', fields: [{ text: 'common rare', boost: 1 }] }, { id: 'y', fields: [{ text: 'common', boost: 1 }] }, { id: 'z', fields: [{ text: 'common', boost: 1 }] }])
    expect(scoreQuery(idx, 'common rare', 3)[0]!.id).toBe('x')
    expect(scoreQuery(idx, 'common', 3).slice(0, 2).map(r => r.id)).toEqual(['y', 'z']) // equal scores: id order
  })
})
