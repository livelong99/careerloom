import { describe, expect, it } from 'vitest'

import { availableMemory, parseVmStat } from './memory'

const SAMPLE = `Mach Virtual Memory Statistics: (page size of 16384 bytes)
Pages free:                               11587.
Pages active:                            213747.
Pages inactive:                          210759.
Pages speculative:                         1707.
Pages throttled:                              0.
`

describe('available memory', () => {
  it('counts free + inactive + speculative pages (what macOS can hand out without paging)', () => {
    expect(parseVmStat(SAMPLE)).toBe((11587 + 210759 + 1707) * 16384)
  })
  it('returns null for output it does not understand', () => {
    expect(parseVmStat('')).toBeNull()
    expect(parseVmStat('Pages free: 5.')).toBeNull()
  })
  it('falls back to the OS free figure off macOS or when vm_stat fails', () => {
    expect(availableMemory({ platform: 'linux', run: () => { throw new Error('no') }, free: () => 123 })).toBe(123)
    expect(availableMemory({ platform: 'darwin', run: () => { throw new Error('boom') }, free: () => 456 })).toBe(456)
    expect(availableMemory({ platform: 'darwin', run: () => 'garbage', free: () => 789 })).toBe(789)
    expect(availableMemory({ platform: 'darwin', run: () => SAMPLE, free: () => 1 })).toBe((11587 + 210759 + 1707) * 16384)
  })
})
