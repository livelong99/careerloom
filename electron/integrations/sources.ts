// Job sources: portals.yml `tracked_companies` entries. No `electron` import —
// testable directly.
import fs from 'node:fs'
import path from 'node:path'
import { isMap, parseDocument, type Document, type YAMLSeq } from 'yaml'

export type BoardMatch = { provider: string; slug: string; careersUrl: string }
/** `fetch` marks a Careerloom web board (any listing page, extracted via Firecrawl + agent) —
 *  no `provider`, so scan.mjs skips it as "no provider matched". `listing_urls` when >1 page. */
export type WebFetch = 'firecrawl' | 'browser'
export type TrackedCompany = { name: string; careers_url?: string; api?: string; provider?: string; enabled?: boolean; fetch?: WebFetch; listing_urls?: string[] }
export type Source = TrackedCompany & { id: string }

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

function writeDoc(portalsPath: string, doc: Document.Parsed): void {
  fs.mkdirSync(path.dirname(portalsPath), { recursive: true })
  fs.writeFileSync(portalsPath, String(doc))
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
