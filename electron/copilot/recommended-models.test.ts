import { describe, expect, it } from 'vitest'
import recommended from './recommended-models.json'
import prices from './prices.json'

describe('recommended-models.json', () => {
  const all = Object.values(recommended.tiers).flat()
  it('never defaults to free/training models, which the default deny policy rejects', () => {
    for (const m of all) expect(m.id.endsWith(':free')).toBe(false)
    for (const m of all) expect((prices.models as Record<string, { promptUsdPerM: number }>)[m.id]?.promptUsdPerM, m.id).toBeGreaterThan(0)
  })
  it('is dated so a stale fallback is visible', () => { expect(recommended.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/) })
})
