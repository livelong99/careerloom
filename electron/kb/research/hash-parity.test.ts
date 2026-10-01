// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { itemId } from './dedupe'
import { inputHashOf } from './plan'
import { inputHash, pageKey, queryKey } from '../hash'

// Pinned vectors for the hash recipes: the research pipeline and the store share the single implementation in kb/hash.ts.
const VECTORS = {
  itemId: ['Explain how closures capture variables in JavaScript?', '4d51a01b7952ef7d35f71e9f96695cd0600df4f3'],
  queryKey: [['brave', 'React interview questions'], '7dff09cdcea2074af2e1a383a6796735165c4581'],
  pageKey: ['https://example.org/a', '579f2a2ceeee0bc369f88d8b2b891d6263265b30'],
  inputHash: [{ jd: { a: 1 }, gaps: ['x'], role: 'r', company: 'c' }, 'acb6e6520d1153afa13ce432f63912f99718f3be'],
} as const

describe('hash vectors (research-local copies)', () => {
  it('itemId, queryKey, pageKey and inputHash are pinned', () => {
    expect(itemId(VECTORS.itemId[0])).toBe(VECTORS.itemId[1])
    expect(itemId('explain how closures capture variables in javascript.')).toBe(VECTORS.itemId[1])
    expect(queryKey(...(VECTORS.queryKey[0] as [string, string]))).toBe(VECTORS.queryKey[1])
    expect(queryKey('brave', '  REACT interview questions ')).toBe(VECTORS.queryKey[1])
    expect(pageKey(VECTORS.pageKey[0])).toBe(VECTORS.pageKey[1])
    expect(inputHashOf({ jd: { a: 1 }, gaps: ['x'], role: 'r', company: 'c' })).toBe(VECTORS.inputHash[1])
    expect(inputHash({ jd: { a: 1 }, gaps: ['x'], role: 'r', company: 'c' })).toBe(VECTORS.inputHash[1])
  })

})
