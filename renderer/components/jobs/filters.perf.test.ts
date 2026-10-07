import { describe, expect, it } from 'vitest'

import { DEFAULT_FILTERS, applyJobFilters, facetCounts, type ScreenedJob } from './filters'

const jobs = Array.from({ length: 5000 }, (_, i): ScreenedJob => ({
  id: `j${i}`, title: `Engineer ${i}`, company: `Co ${i % 400}`, location: `City ${i % 50}`, state: 'new', score: null, trustFlags: [], stale: false,
  portalId: `p${i % 24}`, firstSeen: '2026-09-01', url: `https://x/${i}`,
} as unknown as ScreenedJob))

describe('5k-row filtering', () => {
  it('filters and facets stay interactive', () => {
    const f = { ...DEFAULT_FILTERS, query: 'engineer 4', companies: jobs.slice(0, 200).map(j => j.company) }
    const t = performance.now()
    applyJobFilters(jobs, f)
    for (const facet of ['portals', 'companies', 'states', 'locations', 'trustFlags', 'screen'] as const) facetCounts(jobs, f, facet)
    const ms = performance.now() - t
    console.log('5k filter+facets ms', ms.toFixed(1))
    expect(ms).toBeLessThan(250)
  })
})
