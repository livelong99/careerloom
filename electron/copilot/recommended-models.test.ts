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
  it('every model starts with thinking off (the provider walks the ladder if one refuses)', () => {
    for (const list of Object.values(recommended.tiers)) for (const m of list) expect(initialReasoning(m.id), m.id).toEqual({ enabled: false })
  })
  it('flags vision per model (OpenRouter input_modalities) and offers at least one vision default per tier', () => {
    for (const m of all) expect(typeof (m as { vision?: boolean }).vision, m.id).toBe('boolean')
    for (const [tier, list] of Object.entries(recommended.tiers)) expect(list.some(m => (m as { vision?: boolean }).vision), tier).toBe(true)
  })
})
