import { describe, expect, it } from 'vitest'

import { newlyExpired, retentionLabel } from './retention'
import type { SessionSummary } from '@/lib/types'

const DAY = 86_400_000
const NOW = 1_800_000_000_000
const s = (ageDays: number, ended = true): SessionSummary => ({ id: `s${ageDays}`, startedAt: NOW - ageDays * DAY, endedAt: ended ? NOW - ageDays * DAY : null, mode: 'practice', jobId: 'j', jobTitle: 't', company: 'c', questions: 1, durationSec: 1, score: null })

describe('newlyExpired', () => {
  const all = [s(5), s(40), s(100), s(400)]
  it('counts only sessions newly out of range when lowering', () => {
    expect(newlyExpired(all, 90, 30, NOW)).toBe(1) // the 40-day one; 100 and 400 were already swept at 90
    expect(newlyExpired(all, 365, 30, NOW)).toBe(2) // 40 and 100
    expect(newlyExpired(all, null, 30, NOW)).toBe(3)
  })
  it('is zero when raising or keeping forever', () => {
    expect(newlyExpired(all, 30, 90, NOW)).toBe(0)
    expect(newlyExpired(all, 30, null, NOW)).toBe(0)
  })
  it('0 means every ended session, never one still running', () => {
    expect(newlyExpired([s(1), s(2, false)], 90, 0, NOW)).toBe(1)
  })
})
describe('retentionLabel', () => {
  it('names the presets and falls back to days', () => {
    expect(retentionLabel(90)).toBe('3 months')
    expect(retentionLabel(null)).toBe('Until I delete them')
    expect(retentionLabel(45)).toBe('45 days')
  })
})
