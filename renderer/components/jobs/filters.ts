import type { Application, JobListing, JobState, Portal, PrescreenBucket, PrescreenEntry } from '../../lib/types'

/** A job with its pre-screen result merged in (Jobs.tsx joins readPrescreen() by id). */
export type ScreenedJob = JobListing & { screen?: PrescreenEntry }
export type ScreenKey = PrescreenBucket | 'unscreened'
export const SCREENS: Array<{ id: ScreenKey; label: string }> = [
  { id: 'likely', label: 'Likely fit' }, { id: 'uncertain', label: 'Needs agent' }, { id: 'unlikely', label: 'Unlikely' }, { id: 'unscreened', label: 'Not screened' },
]
const screenKey = (j: ScreenedJob): ScreenKey => j.screen?.bucket ?? 'unscreened'

export type JobFilters = {
  query: string
  portals: string[]
  companies: string[]
  states: JobState[]
  locations: string[]
  trustFlags: string[]
  scoreMin: number
  scoreMax: number
  postedFrom: string | null
  postedTo: string | null
  staleOnly: boolean
  screen: ScreenKey[]
  hideUnlikely: boolean
}

export const DEFAULT_FILTERS: JobFilters = {
  query: '', portals: [], companies: [], states: [], locations: [], trustFlags: [],
  scoreMin: 0, scoreMax: 5, postedFrom: null, postedTo: null, staleOnly: false, screen: [], hideUnlikely: false,
}

export const STATES: Array<{ id: JobState; label: string }> = [
  { id: 'new', label: 'New' }, { id: 'queued', label: 'Queued' }, { id: 'evaluated', label: 'Evaluated' },
  { id: 'applied', label: 'Applied' }, { id: 'interview', label: 'Interview' }, { id: 'offer', label: 'Offer' }, { id: 'closed', label: 'Closed' },
]
export const stateLabel = (s: JobState) => STATES.find(x => x.id === s)?.label ?? s

// Kept in sync with electron/tracker-actions.ts's own copy (different process).
export const CANONICAL_STATUSES = ['Evaluated', 'Applied', 'Responded', 'Interview', 'Offer', 'Hired', 'Rejected', 'Discarded', 'SKIP'] as const

export const NO_PORTAL = '(pasted)'
export const NO_LOCATION = '(none)'
const portalKey = (j: JobListing) => j.portalId ?? NO_PORTAL
const locationKey = (j: JobListing) => j.location?.trim() || NO_LOCATION
/** Posted date, falling back to when the scanner first saw it. */
export const postedOf = (j: JobListing) => (j.postedAt ?? j.firstSeen ?? '').slice(0, 10)

/** Drops portal filters whose portal was removed (e.g. after switching starter packs): they match nothing and show as raw ids. */
export function pruneStalePortals(f: JobFilters, known: Set<string>): JobFilters {
  const portals = f.portals.filter(p => p === NO_PORTAL || known.has(p))
  return portals.length === f.portals.length ? f : { ...f, portals }
}

export function applyJobFilters<T extends ScreenedJob>(jobs: T[], f: JobFilters): T[] {
  const q = f.query.trim().toLowerCase()
  return jobs.filter(j => {
    if (f.portals.length && !f.portals.includes(portalKey(j))) return false
    if (f.companies.length && !f.companies.includes(j.company)) return false
    if (f.states.length && !f.states.includes(j.state)) return false
    if (f.locations.length && !f.locations.includes(locationKey(j))) return false
    if (f.trustFlags.length && !f.trustFlags.some(t => j.trustFlags.includes(t))) return false
    if (j.score === null ? f.scoreMin > 0 : j.score < f.scoreMin || j.score > f.scoreMax) return false
    const posted = postedOf(j)
    if ((f.postedFrom || f.postedTo) && !posted) return false
    if (f.postedFrom && posted < f.postedFrom) return false
    if (f.postedTo && posted > f.postedTo) return false
    if (f.staleOnly && !j.stale) return false
    if (f.screen.length && !f.screen.includes(screenKey(j))) return false
    if (f.hideUnlikely && j.screen?.bucket === 'unlikely') return false
    if (q && !`${j.title} ${j.company} ${j.location ?? ''} ${j.status ?? ''}`.toLowerCase().includes(q)) return false
    return true
  })
}

type Facet = 'portals' | 'companies' | 'states' | 'locations' | 'trustFlags' | 'screen'
const KEYS: Record<Facet, (j: ScreenedJob) => string[]> = {
  portals: j => [portalKey(j)], companies: j => [j.company], states: j => [j.state],
  locations: j => [locationKey(j)], trustFlags: j => j.trustFlags, screen: j => [screenKey(j)],
}

/** Option counts for one facet with every OTHER filter applied, so picking one option never zeroes its siblings. */
export function facetCounts(jobs: ScreenedJob[], f: JobFilters, facet: Facet): Map<string, number> {
  const counts = new Map<string, number>()
  for (const j of applyJobFilters(jobs, { ...f, [facet]: [] })) for (const k of KEYS[facet](j)) counts.set(k, (counts.get(k) ?? 0) + 1)
  return counts
}

export type FilterChip = { key: string; label: string; value: string }

export function activeFilterChips(f: JobFilters, portals: Portal[]): FilterChip[] {
  const name = (id: string) => portals.find(p => p.id === id)?.name ?? id
  return [
    ...f.portals.map(p => ({ key: `portals:${p}`, label: 'Portal', value: name(p) })),
    ...f.companies.map(c => ({ key: `companies:${c}`, label: 'Company', value: c })),
    ...f.states.map(s => ({ key: `states:${s}`, label: 'State', value: stateLabel(s) })),
    ...f.locations.map(l => ({ key: `locations:${l}`, label: 'Location', value: l })),
    ...f.trustFlags.map(t => ({ key: `trustFlags:${t}`, label: 'Trust', value: t })),
    ...(f.scoreMin > 0 || f.scoreMax < 5 ? [{ key: 'score', label: 'Fit', value: `${f.scoreMin.toFixed(1)}–${f.scoreMax.toFixed(1)}` }] : []),
    ...(f.postedFrom || f.postedTo ? [{ key: 'posted', label: 'Posted', value: `${f.postedFrom ?? '…'} → ${f.postedTo ?? '…'}` }] : []),
    ...(f.staleOnly ? [{ key: 'stale', label: 'Résumé', value: 'Stale only' }] : []),
    ...f.screen.map(k => ({ key: `screen:${k}`, label: 'Pre-screen', value: SCREENS.find(x => x.id === k)?.label ?? k })),
    ...(f.hideUnlikely ? [{ key: 'hideUnlikely', label: 'Pre-screen', value: 'Hide unlikely' }] : []),
  ]
}

export function removeFilterChip(f: JobFilters, key: string): JobFilters {
  if (key === 'score') return { ...f, scoreMin: 0, scoreMax: 5 }
  if (key === 'posted') return { ...f, postedFrom: null, postedTo: null }
  if (key === 'stale') return { ...f, staleOnly: false }
  if (key === 'hideUnlikely') return { ...f, hideUnlikely: false }
  const i = key.indexOf(':')
  const facet = key.slice(0, i) as Facet
  if (!(facet in KEYS)) return f
  return { ...f, [facet]: (f[facet] as string[]).filter(v => v !== key.slice(i + 1)) }
}

export function toggle<T extends string>(list: T[], value: T): T[] {
  return list.includes(value) ? list.filter(v => v !== value) : [...list, value]
}

/** ReportDrawer / PipelineBoard speak tracker Applications; evaluated jobs map onto one. */
export function toApplication(j: JobListing, portals: Portal[]): Application | null {
  if (j.reportNum === null) return null
  return {
    num: j.reportNum, date: j.evaluatedAt ?? '', company: j.company, role: j.title, score: j.score,
    via: portals.find(p => p.id === j.portalId)?.name ?? null,
    status: j.status ?? 'Evaluated', pdf: false, report: j.reportPath, notes: '',
  }
}

export type SavedView = { id: string; name: string; filters: JobFilters }
const VIEWS_KEY = 'careerloom.jobViews'
const FILTERS_KEY = 'careerloom.jobFilters'

export function loadSavedViews(): SavedView[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(VIEWS_KEY) ?? '[]') as unknown
    return Array.isArray(parsed) ? parsed as SavedView[] : []
  } catch {
    return []
  }
}

export function saveSavedViews(views: SavedView[]): void {
  try { localStorage.setItem(VIEWS_KEY, JSON.stringify(views)) } catch { /* storage can be unavailable */ }
}

export function loadPersistedFilters(): JobFilters {
  try {
    const raw = localStorage.getItem(FILTERS_KEY)
    return raw ? { ...DEFAULT_FILTERS, ...JSON.parse(raw) as Partial<JobFilters> } : DEFAULT_FILTERS
  } catch {
    return DEFAULT_FILTERS
  }
}

export function persistFilters(f: JobFilters): void {
  try { localStorage.setItem(FILTERS_KEY, JSON.stringify(f)) } catch { /* storage can be unavailable */ }
}
