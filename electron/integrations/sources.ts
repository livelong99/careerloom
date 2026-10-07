// Job sources: portals.yml `tracked_companies` entries. No `electron` import —
// testable directly.
import fs from 'node:fs'
import path from 'node:path'
import { isMap, parseDocument, type Document, type YAMLSeq } from 'yaml'

export type BoardMatch = { provider: string; slug: string; careersUrl: string }
/** `fetch` marks a Careerloom web board (any listing page, extracted via Firecrawl + agent) —
 *  no `provider`, so scan.mjs skips it as "no provider matched". `listing_urls` when >1 page. */
export type WebFetch = 'firecrawl' | 'browser'
export type TrackedCompany = { name: string; careers_url?: string; api?: string; provider?: string; enabled?: boolean; fetch?: WebFetch; listing_urls?: string[]; category?: string }
/** `list: 'job_boards'` = an entry of portals.yml's job_boards (aggregators), else tracked_companies. */
export type Source = TrackedCompany & { id: string; list?: 'job_boards' }

// Vendor host → {provider id, careers_url builder}, matching career-ops'
// discover-ats.mjs VENDORS table (providers/<id>.mjs). One match wins; first
// matching entry in order.
type Vendor = { provider: string; test: (u: URL) => string | null; buildUrl: (slug: string) => string }
const VENDORS: Vendor[] = [
  { provider: 'greenhouse', test: u => (u.hostname === 'boards.greenhouse.io' || u.hostname === 'job-boards.greenhouse.io') ? firstSegment(u) : null, buildUrl: s => `https://job-boards.greenhouse.io/${s}` },
  { provider: 'ashby', test: u => u.hostname === 'jobs.ashbyhq.com' ? firstSegment(u) : null, buildUrl: s => `https://jobs.ashbyhq.com/${s}` },
  { provider: 'lever', test: u => u.hostname === 'jobs.lever.co' ? firstSegment(u) : null, buildUrl: s => `https://jobs.lever.co/${s}` },
  { provider: 'workable', test: u => u.hostname === 'apply.workable.com' ? firstSegment(u) : null, buildUrl: s => `https://apply.workable.com/${s}` },
  { provider: 'smartrecruiters', test: u => u.hostname === 'careers.smartrecruiters.com' ? firstSegment(u) : null, buildUrl: s => `https://careers.smartrecruiters.com/${s}` },
  { provider: 'rippling', test: u => u.hostname === 'ats.rippling.com' ? firstSegment(u) : null, buildUrl: s => `https://ats.rippling.com/${s}/jobs` },
  { provider: 'join', test: u => (u.hostname === 'join.com' && u.pathname.startsWith('/companies/')) ? u.pathname.split('/')[2] ?? null : null, buildUrl: s => `https://join.com/companies/${s}` },
  { provider: 'recruitee', test: u => u.hostname.endsWith('.recruitee.com') ? subdomain(u) : null, buildUrl: s => `https://${s}.recruitee.com` },
  { provider: 'breezy', test: u => u.hostname.endsWith('.breezy.hr') ? subdomain(u) : null, buildUrl: s => `https://${s}.breezy.hr` },
  { provider: 'bamboohr', test: u => u.hostname.endsWith('.bamboohr.com') ? subdomain(u) : null, buildUrl: s => `https://${s}.bamboohr.com` },
  { provider: 'pinpoint', test: u => u.hostname.endsWith('.pinpointhq.com') ? subdomain(u) : null, buildUrl: s => `https://${s}.pinpointhq.com` },
]

function firstSegment(u: URL): string | null {
  const seg = u.pathname.split('/').filter(Boolean)[0]
  return seg || null
}
function subdomain(u: URL): string | null {
  const s = u.hostname.split('.')[0]
  return s || null
}

/** Parses a pasted job-board URL into {provider, slug, careersUrl}, or null when
 *  it isn't one career-ops' bundled providers recognize. */
export function parseJobBoardUrl(raw: string): BoardMatch | null {
  let u: URL
  try { u = new URL(raw.trim()) } catch { return null }
  if (u.protocol !== 'https:' && u.protocol !== 'http:') return null
  for (const vendor of VENDORS) {
    const slug = vendor.test(u)
    if (slug) return { provider: vendor.provider, slug, careersUrl: vendor.buildUrl(slug) }
  }
  return null
}

export function slugify(name: string): string {
  return name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/(^-+|-+$)/g, '') || 'company'
}

/** Stable ids for the list: slugified name, de-duplicated by position. */
export function withSourceIds(companies: TrackedCompany[]): Source[] {
  const seen = new Map<string, number>()
  return companies.map(c => {
    const base = slugify(c.name)
    const n = (seen.get(base) ?? 0) + 1
    seen.set(base, n)
    return { ...c, id: n === 1 ? `source:${base}` : `source:${base}-${n}` }
  })
}

/** job_boards entries, ids `board:<slug>`. */
export function withBoardIds(boards: TrackedCompany[]): Source[] {
  return withSourceIds(boards).map(b => ({ ...b, id: b.id.replace(/^source:/, 'board:'), list: 'job_boards' as const }))
}

export function readJobBoards(portalsPath: string): TrackedCompany[] {
  if (!fs.existsSync(portalsPath)) return []
  const value = (readPortalsFile(portalsPath).toJS() as { job_boards?: unknown } | null)?.job_boards
  return Array.isArray(value) ? (value as TrackedCompany[]).filter(b => b && typeof b.name === 'string') : []
}

/** Every portal the Jobs rail shows: tracked companies, then job boards. */
export function readAllSources(portalsPath: string): Source[] {
  return [...withSourceIds(readTrackedCompanies(portalsPath)), ...withBoardIds(readJobBoards(portalsPath))]
}

/** Removes these portals (matched by list + name) in one write, keeping the file's comments. */
export function removeSources(portalsPath: string, remove: Source[]): void {
  const doc = readPortalsFile(portalsPath)
  for (const key of ['tracked_companies', 'job_boards'] as const) {
    const names = new Set(remove.filter(s => (s.list ?? 'tracked_companies') === key).map(s => s.name))
    const seq = doc.get(key, true) as YAMLSeq | undefined
    if (!names.size || !seq) continue
    seq.items = seq.items.filter(item => !names.has(String((item as { get?: (k: string) => unknown }).get?.('name'))))
  }
  writeDoc(portalsPath, doc)
}

/** portals.yml cut to the chosen companies and job boards (forced enabled); search_queries dropped. */
export function subsetScanYaml(text: string, chosen: Source[]): string {
  const doc = parseDocument(text)
  const js = (doc.toJS() ?? {}) as { tracked_companies?: Array<Record<string, unknown>>; job_boards?: Array<Record<string, unknown>> }
  const pick = (list: Array<Record<string, unknown>> | undefined, key: 'tracked_companies' | 'job_boards') => {
    const names = new Set(chosen.filter(s => (s.list ?? 'tracked_companies') === key).map(s => s.name))
    return (list ?? []).filter(c => names.has(String(c.name))).map(c => ({ ...c, enabled: true }))
  }
  doc.delete('search_queries')
  doc.set('tracked_companies', pick(js.tracked_companies, 'tracked_companies'))
  doc.set('job_boards', pick(js.job_boards, 'job_boards'))
  return String(doc)
}

/** An edit from the Boards editor; `null` removes an optional key. */
export type SourcePatch = { name?: string; urls?: string[]; enabled?: boolean; fetch?: WebFetch; provider?: string | null; api?: string | null }

/** Applies edits to portals.yml entries in place (other keys and comments kept), one write. */
export function updateSources(portalsPath: string, edits: Array<[Source, SourcePatch]>): void {
  const doc = readPortalsFile(portalsPath)
  for (const [source, patch] of edits) {
    const seq = doc.get(source.list ?? 'tracked_companies', true) as YAMLSeq | undefined
    const item = seq?.items.find(i => isMap(i) && i.get('name') === source.name)
    if (!isMap(item)) throw new Error(`"${source.name}" is no longer in portals.yml — refresh and try again`)
    if (patch.name !== undefined) item.set('name', patch.name)
    if (patch.urls) {
      item.set('careers_url', patch.urls[0])
      if (patch.urls.length > 1) item.set('listing_urls', patch.urls)
      else item.delete('listing_urls')
    }
    if (patch.enabled !== undefined) item.set('enabled', patch.enabled)
    if (patch.fetch !== undefined) item.set('fetch', patch.fetch)
    for (const key of ['provider', 'api'] as const) {
      if (patch[key] === null) item.delete(key)
      else if (patch[key] !== undefined) item.set(key, patch[key])
    }
  }
  writeDoc(portalsPath, doc)
}

export function readPortalsFile(portalsPath: string): Document.Parsed {
  const raw = fs.existsSync(portalsPath) ? fs.readFileSync(portalsPath, 'utf8') : 'tracked_companies: []\n'
  return parseDocument(raw)
}

function trackedSeq(doc: Document.Parsed): YAMLSeq {
  let seq = doc.get('tracked_companies', true) as YAMLSeq | undefined
  if (!seq) {
    doc.set('tracked_companies', [])
    seq = doc.get('tracked_companies', true) as YAMLSeq
  }
  return seq
}

export function readTrackedCompanies(portalsPath: string): TrackedCompany[] {
  if (!fs.existsSync(portalsPath)) return []
  const doc = readPortalsFile(portalsPath)
  // `Document#get` only unwraps a Scalar's value — a nested collection comes
  // back as its Node, so the whole-document toJS() is what actually recurses.
  const value = (doc.toJS() as { tracked_companies?: unknown } | null)?.tracked_companies
  return Array.isArray(value) ? (value as TrackedCompany[]) : []
}

export function writeDoc(portalsPath: string, doc: Document.Parsed): void {
  fs.mkdirSync(path.dirname(portalsPath), { recursive: true })
  const tmp = `${portalsPath}.${process.pid}.tmp` // temp + rename: a crash never truncates the user's portals.yml
  fs.writeFileSync(tmp, String(doc))
  fs.renameSync(tmp, portalsPath)
}

/** Appends one company entry, preserving the rest of the file's comments/formatting. */
export function addTrackedCompany(portalsPath: string, entry: TrackedCompany): void {
  const doc = readPortalsFile(portalsPath)
  const seq = trackedSeq(doc)
  seq.add(doc.createNode(entry))
  writeDoc(portalsPath, doc)
}

function findIndex(seq: YAMLSeq, id: string): number {
  const companies = withSourceIds(seq.items.map(item => (item as { toJSON: () => TrackedCompany }).toJSON()))
  return companies.findIndex(c => c.id === id)
}

export function setTrackedCompanyEnabled(portalsPath: string, id: string, enabled: boolean): void {
  const doc = readPortalsFile(portalsPath)
  const seq = trackedSeq(doc)
  const index = findIndex(seq, id)
  if (index < 0) throw new Error(`Job source "${id}" not found in portals.yml`)
  const item = seq.get(index, true)
  if (isMap(item)) item.set('enabled', enabled)
  writeDoc(portalsPath, doc)
}

export function removeTrackedCompany(portalsPath: string, id: string): void {
  const doc = readPortalsFile(portalsPath)
  const seq = trackedSeq(doc)
  const index = findIndex(seq, id)
  if (index < 0) throw new Error(`Job source "${id}" not found in portals.yml`)
  doc.deleteIn(['tracked_companies', index])
  writeDoc(portalsPath, doc)
}
