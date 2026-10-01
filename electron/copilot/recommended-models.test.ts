import { describe, expect, it } from 'vitest'
import recommended from './recommended-models.json'
import prices from './prices.json'
import { initialReasoning } from './providers/reasoning'

describe('recommended-models.json', () => {
  const all = Object.values(recommended.tiers).flat()
  it('never defaults to free/training models, which the default deny policy rejects', () => {
    for (const m of all) expect(m.id.endsWith(':free')).toBe(false)
    for (const m of all) expect((prices.models as Record<string, { promptUsdPerM: number }>)[m.id]?.promptUsdPerM, m.id).toBeGreaterThan(0)
  })
  it('is dated so a stale fallback is visible', () => { expect(recommended.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/) })
  it('default of every tier is sent a reasoning shape the model accepts; the fast default needs no reasoning at all', () => {
    for (const list of Object.values(recommended.tiers)) for (const m of list) expect(initialReasoning(m.id), m.id).not.toEqual({ enabled: false })
    expect(initialReasoning(recommended.tiers.fast[0]!.id)).toBeNull()
    expect(initialReasoning(recommended.tiers.balanced[0]!.id)).toBeNull()
  })
})
