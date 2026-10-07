// @vitest-environment jsdom
// (localStorage round-trip below needs jsdom's Storage; the node env's is disabled — see vitest.config.ts)
import { describe, expect, it } from 'vitest'

import type { JobListing, Portal } from '../../lib/types'
import {
  activeFilterChips, applyJobFilters, DEFAULT_FILTERS, facetCounts, loadPersistedFilters, loadSavedViews,
  NO_LOCATION, NO_PORTAL, persistFilters, pruneStalePortals, removeFilterChip, saveSavedViews, toApplication, type JobFilters, type ScreenedJob,
} from './filters'

function job(over: Partial<ScreenedJob>): ScreenedJob {
  return {
    id: 'u', url: 'https://x.io/1', title: 'Engineer', company: 'Acme', portalId: 'source:acme', ats: 'greenhouse',
    location: 'Remote', postedAt: '2026-09-10', firstSeen: '2026-09-11', trustScore: null, trustFlags: [], state: 'new',
    status: null, score: null, reportNum: null, reportPath: null, evaluatedAt: null, stale: false, ...over,
  }
}

const jobs = [
  job({ id: 'a', title: 'Staff Platform', state: 'evaluated', score: 4.5, reportNum: 3, reportPath: 'reports/003.md', status: 'Evaluated', stale: true }),
  job({ id: 'b', company: 'Ramp', portalId: 'source:ramp', location: 'NYC', postedAt: null, firstSeen: '2026-08-01', trustFlags: ['ghost'] }),
  job({ id: 'c', portalId: null, location: null, state: 'queued', postedAt: null, firstSeen: null }),
]
const portals: Portal[] = [{ id: 'source:acme', name: 'Acme', ats: 'greenhouse', careersUrl: null, enabled: true, jobCount: 2, newCount: 0, lastSeen: null, guideline: null }]
const ids = (list: JobListing[]) => list.map(j => j.id)

describe('applyJobFilters', () => {
  it('filters by portal (incl. pasted), state, location, trust, fit, posted range, stale and text', () => {
    expect(ids(applyJobFilters(jobs, { ...DEFAULT_FILTERS, portals: ['source:ramp', NO_PORTAL] }))).toEqual(['b', 'c'])
    expect(ids(applyJobFilters(jobs, { ...DEFAULT_FILTERS, states: ['queued'] }))).toEqual(['c'])
    expect(ids(applyJobFilters(jobs, { ...DEFAULT_FILTERS, locations: [NO_LOCATION] }))).toEqual(['c'])
    expect(ids(applyJobFilters(jobs, { ...DEFAULT_FILTERS, trustFlags: ['ghost'] }))).toEqual(['b'])
    expect(ids(applyJobFilters(jobs, { ...DEFAULT_FILTERS, scoreMin: 4 }))).toEqual(['a'])
    // Posted falls back to first seen; undated jobs drop out of a date range.
    expect(ids(applyJobFilters(jobs, { ...DEFAULT_FILTERS, postedFrom: '2026-08-01', postedTo: '2026-08-31' }))).toEqual(['b'])
    expect(ids(applyJobFilters(jobs, { ...DEFAULT_FILTERS, staleOnly: true }))).toEqual(['a'])
    expect(ids(applyJobFilters(jobs, { ...DEFAULT_FILTERS, query: 'platform' }))).toEqual(['a'])
  })

  it('facet counts ignore the facet’s own selection', () => {
    const counts = facetCounts(jobs, { ...DEFAULT_FILTERS, portals: ['source:ramp'] }, 'portals')
    expect(counts.get('source:acme')).toBe(1)
    expect(counts.get(NO_PORTAL)).toBe(1)
  })
})

describe('chips', () => {
  it('names portals and removes each chip kind', () => {
    const f: JobFilters = { ...DEFAULT_FILTERS, portals: ['source:acme'], states: ['new'], scoreMin: 3, postedFrom: '2026-01-01', staleOnly: true }
    const chips = activeFilterChips(f, portals)
    expect(chips.map(c => c.value)).toEqual(['Acme', 'New', '3.0–5.0', '2026-01-01 → …', 'Stale only'])
    const cleared = chips.reduce((acc, c) => removeFilterChip(acc, c.key), f)
    expect(cleared).toEqual(DEFAULT_FILTERS)
  })
})

describe('toApplication', () => {
  it('maps evaluated jobs for the drawer and board; skips unevaluated', () => {
    expect(toApplication(jobs[0]!, portals)).toMatchObject({ num: 3, report: 'reports/003.md', via: 'Acme', status: 'Evaluated' })
    expect(toApplication(jobs[1]!, portals)).toBeNull()
  })
})

describe('persistence', () => {
  it('round-trips filters and saved views', () => {
    persistFilters({ ...DEFAULT_FILTERS, query: 'x' })
    expect(loadPersistedFilters().query).toBe('x')
    saveSavedViews([{ id: '1', name: 'Mine', filters: DEFAULT_FILTERS }])
    expect(loadSavedViews()).toHaveLength(1)
  })
})

describe('pre-screen filters', () => {
  const entry = (bucket: 'likely' | 'uncertain' | 'unlikely') => ({ bucket, fit: 0.5, reason: 'r', signals: { otherFunction: null, targetRole: null }, at: '', profileHash: '', method: 'rules' as const, gate: 'keywords' as const })
  const screened = [job({ id: 'l', screen: entry('likely') }), job({ id: 'u', screen: entry('unlikely') }), job({ id: 'n' })]
  it('filters by bucket (incl. unscreened), hides unlikely, counts and chips', () => {
    expect(ids(applyJobFilters(screened, { ...DEFAULT_FILTERS, screen: ['likely', 'unscreened'] }))).toEqual(['l', 'n'])
    expect(ids(applyJobFilters(screened, { ...DEFAULT_FILTERS, hideUnlikely: true }))).toEqual(['l', 'n'])
    expect(Object.fromEntries(facetCounts(screened, DEFAULT_FILTERS, 'screen'))).toEqual({ likely: 1, unlikely: 1, unscreened: 1 })
    const f = { ...DEFAULT_FILTERS, screen: ['likely' as const], hideUnlikely: true }
    expect(activeFilterChips(f, [])).toEqual([
      { key: 'screen:likely', label: 'Pre-screen', value: 'Likely fit' }, { key: 'hideUnlikely', label: 'Pre-screen', value: 'Hide unlikely' },
    ])
    expect(removeFilterChip(removeFilterChip(f, 'screen:likely'), 'hideUnlikely')).toEqual(DEFAULT_FILTERS)
  })
})

describe('pruneStalePortals', () => {
  it('drops portal filters for portals that no longer exist, keeps the rest', () => {
    const f = { ...DEFAULT_FILTERS, portals: ['source:gone', 'source:ramp', NO_PORTAL] }
    expect(pruneStalePortals(f, new Set(['source:ramp'])).portals).toEqual(['source:ramp', NO_PORTAL])
    expect(pruneStalePortals(f, new Set(['source:gone', 'source:ramp']))).toBe(f)
  })
})
