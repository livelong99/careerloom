import { describe, expect, it } from 'vitest'
import { createCostMeter, defaultPrices, estimateUsd } from './cost'

const table = { asOf: '2026-10-01', models: { 'a/b': { promptUsdPerM: 1, completionUsdPerM: 5 } } }
describe('cost meter', () => {
  it('prices tokens per million and accumulates', () => {
    const m = createCostMeter(table)
    expect(m.add('a/b', 5000, 300)).toBeCloseTo(0.0065, 6)
    m.add('a/b', 1_000_000, 0)
    expect(m.totalUsd()).toBeCloseTo(1.0065, 6)
    expect(m.exceeds(1)).toBe(true)
    expect(m.exceeds(2)).toBe(false)
  })
  it('prefers the provider-billed figure', () => {
    const m = createCostMeter(table)
    expect(m.add('a/b', 1000, 1000, 0.5)).toBe(0.5)
  })
  it('reports unpriced models instead of pretending they are free', () => {
    const m = createCostMeter(table)
    expect(m.add('x/y', 10, 10)).toBe(0)
    expect(m.unpriced()).toEqual(['x/y'])
    expect(estimateUsd(table, 'x/y', 1, 1)).toBeNull()
  })
  it('ships a dated bundled table covering every recommended model', async () => {
    const rec = (await import('./recommended-models.json')).default as { asOf: string; tiers: Record<string, { id: string }[]> }
    expect(defaultPrices.asOf).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    for (const list of Object.values(rec.tiers)) for (const m of list) expect(defaultPrices.models[m.id], m.id).toBeDefined()
  })
})

import { interviewUsd } from './cost'
const ct = { asOf: 'x', models: { 'a/b': { promptUsdPerM: 1, completionUsdPerM: 5, cachedUsdPerM: 0.1 }, 'n/c': { promptUsdPerM: 1, completionUsdPerM: 5 } } }
describe('cached-token pricing (PERF-1)', () => {
  it('bills cached tokens at the cached rate, the rest at the prompt rate', () => {
    expect(estimateUsd(ct, 'a/b', 6000, 0, 5000)).toBeCloseTo((1000 * 1 + 5000 * 0.1) / 1e6, 9)
    expect(createCostMeter(ct).add('a/b', 6000, 100, null, 5000)).toBeCloseTo((1000 + 500 + 500) / 1e6, 9)
  })
  it('ignores cached tokens when the model has no cached price, and clamps to the prompt size', () => {
    expect(estimateUsd(ct, 'n/c', 1000, 0, 900)).toBeCloseTo(1000 / 1e6, 9)
    expect(estimateUsd(ct, 'a/b', 100, 0, 9999)).toBeCloseTo(100 * 0.1 / 1e6, 9)
  })
  it('interview cost: caching saves, false positives add calls, unknown models are null', () => {
    const plain = interviewUsd(ct, 'a/b')!
    expect(interviewUsd(ct, 'a/b', { cacheHitRate: 1 })!).toBeLessThan(plain)
    expect(interviewUsd(ct, 'a/b', { autoFalsePositive: 0.5 })!).toBeCloseTo(plain * 2, 6)
    expect(interviewUsd(ct, 'x/y')).toBeNull()
  })
})
