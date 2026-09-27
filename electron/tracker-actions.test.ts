import { describe, expect, it } from 'vitest'

import { MAX_NUMS, validateSetStatusInput } from './tracker-actions'

describe('validateSetStatusInput', () => {
  it('accepts positive integers and a canonical status', () => {
    expect(validateSetStatusInput([1, 2, 3], 'Applied')).toEqual({ ok: true, nums: [1, 2, 3], status: 'Applied' })
  })

  it('rejects an empty or non-array nums', () => {
    expect(validateSetStatusInput([], 'Applied').ok).toBe(false)
    expect(validateSetStatusInput('1', 'Applied').ok).toBe(false)
    expect(validateSetStatusInput(null, 'Applied').ok).toBe(false)
  })

  it('rejects non-positive, non-integer or non-numeric nums', () => {
    expect(validateSetStatusInput([0], 'Applied').ok).toBe(false)
    expect(validateSetStatusInput([-1], 'Applied').ok).toBe(false)
    expect(validateSetStatusInput([1.5], 'Applied').ok).toBe(false)
    expect(validateSetStatusInput(['1'], 'Applied').ok).toBe(false)
  })

  it('rejects more nums than the max, accepts exactly the max', () => {
    expect(validateSetStatusInput(Array.from({ length: MAX_NUMS + 1 }, (_, i) => i + 1), 'Applied').ok).toBe(false)
    expect(validateSetStatusInput(Array.from({ length: MAX_NUMS }, (_, i) => i + 1), 'Applied').ok).toBe(true)
  })

  it('rejects a non-canonical or non-string status', () => {
    expect(validateSetStatusInput([1], 'Bogus').ok).toBe(false)
    expect(validateSetStatusInput([1], 42).ok).toBe(false)
  })
})
