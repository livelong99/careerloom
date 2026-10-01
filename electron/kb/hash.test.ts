// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { contentHash, inputHash, itemId, pageKey, queryKey } from './hash'

describe('hash keys', () => {
  it('itemId ignores case and punctuation, differs for different questions', () => {
    expect(itemId('Tell me, about X!')).toBe(itemId('tell me about x'))
    expect(itemId('tell me about x')).not.toBe(itemId('tell me about y'))
    expect(itemId('c++ vs c#')).not.toBe(itemId('c vs c'))
  })
  it('inputHash is key-order independent and sensitive to every part', () => {
    const a = { jd: { b: 1, a: [1, 2] }, gaps: ['x'], role: 'SWE', company: 'Acme' }
    expect(inputHash(a)).toBe(inputHash({ company: 'Acme', role: 'SWE', gaps: ['x'], jd: { a: [1, 2], b: 1 } }))
    for (const b of [{ ...a, role: 'PM' }, { ...a, company: 'Z' }, { ...a, gaps: [] }, { ...a, jd: {} }]) expect(inputHash(b)).not.toBe(inputHash(a))
  })
  it('queryKey is per backend and normalised; pageKey drops fragment and trailing slash', () => {
    expect(queryKey('brave', 'Kafka  Interview?')).toBe(queryKey('brave', 'kafka interview'))
    expect(queryKey('brave', 'q')).not.toBe(queryKey('exa', 'q'))
    expect(pageKey('https://a.dev/x/#top')).toBe(pageKey('https://a.dev/x'))
    expect(contentHash('a')).toMatch(/^[0-9a-f]{64}$/)
  })
})
