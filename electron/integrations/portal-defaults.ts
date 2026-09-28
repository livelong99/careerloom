// Default portals: Careerloom's India starter pack (24 popular Indian job boards, categorised
// Tech / Finance / Consulting / Common), merged into the user's portals.yml, disabled until the user
// picks them. career-ops' own example list (~170 mostly US/EU company boards) is no longer seeded.
// Never overwrites or duplicates the user's entries; comments kept (yaml Document API).
// No `electron` import — testable directly.
import { isMap, isSeq, parseDocument, type Document, type YAMLSeq } from 'yaml'

import type { TrackedCompany } from './sources'

type Lists = 'tracked_companies' | 'job_boards'
export type SearchProfile = { role: string | null; city: string | null; country: string | null }

/** First primary target role (parenthetical dropped) and location, from config/profile.yml. */
export function searchProfile(profileYaml: string): SearchProfile {
  try {
    const p = (parseDocument(profileYaml).toJS() ?? {}) as { target_roles?: { primary?: unknown }; location?: { city?: unknown; country?: unknown } }
    const primary = Array.isArray(p.target_roles?.primary) ? p.target_roles.primary : []
    const role = typeof primary[0] === 'string' ? primary[0].replace(/\(.*?\)/g, '').replace(/\s+/g, ' ').trim() : ''
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    return { role: role || null, city: str(p.location?.city), country: str(p.location?.country) }
  } catch {
    return { role: null, city: null, country: null }
  }
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '')

export const BOARD_CATEGORIES = ['Common', 'Tech', 'Finance', 'Consulting'] as const
export type BoardCategory = (typeof BOARD_CATEGORIES)[number]

/** India starter pack. Search URLs use the profile's role/city where the board supports it.
 *  `browser` = script-rendered or bot-protected (read in Chrome); `firecrawl` = server-rendered HTML.
 *  Sources: Similarweb India jobs ranking and each board's own listings, checked 2026-09. */
export function presetBoards({ role, city, country }: SearchProfile): TrackedCompany[] {
  const where = [city, country].filter(Boolean).join(', ')
  const q = (params: Record<string, string | null>) =>
    new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]))).toString()
  const board = (category: BoardCategory, name: string, url: string, fetch: 'browser' | 'firecrawl' = 'browser'): TrackedCompany =>
    ({ name, careers_url: url, enabled: false, fetch, category })
  return [
    board('Common', 'Naukri', role ? `https://www.naukri.com/${slug(role)}-jobs${city ? `-in-${slug(city)}` : ''}` : 'https://www.naukri.com/jobs-in-india'),
    board('Common', 'LinkedIn Jobs', `https://www.linkedin.com/jobs/search/?${q({ keywords: role, location: where || 'India' })}`),
    board('Common', 'Indeed India', `https://in.indeed.com/jobs?${q({ q: role, l: city ?? 'India' })}`),
    board('Common', 'foundit', role ? `https://www.foundit.in/search/${slug(role)}-jobs` : 'https://www.foundit.in/search/jobs-in-india'),
    board('Common', 'Shine', 'https://www.shine.com/job-search/jobs-in-india'),
    board('Common', 'Glassdoor India', 'https://www.glassdoor.co.in/Job/india-jobs-SRCH_IL.0,5_IN115.htm'),
    board('Common', 'TimesJobs', 'https://www.timesjobs.com/candidate/job-search.html?txtLocation=India', 'firecrawl'),
    board('Common', 'apna', 'https://apna.co/jobs', 'firecrawl'),
    board('Common', 'Internshala', 'https://internshala.com/fresher-jobs/', 'firecrawl'),
    board('Tech', 'Naukri · IT', 'https://www.naukri.com/software-developer-jobs'),
    board('Tech', 'Instahyre', 'https://www.instahyre.com/software-engineering-jobs/'),
    board('Tech', 'hirist.tech', 'https://www.hirist.tech/', 'firecrawl'),
    board('Tech', 'Cutshort', 'https://cutshort.io/jobs/backend-developer-jobs', 'firecrawl'),
    board('Tech', 'Wellfound India', 'https://wellfound.com/location/india'),
    board('Tech', 'Freshersworld', 'https://www.freshersworld.com/jobs/category/it-software-job-vacancies', 'firecrawl'),
    board('Finance', 'iimjobs · Finance', 'https://www.iimjobs.com/c/banking-finance-jobs', 'firecrawl'),
    board('Finance', 'Naukri · Finance', 'https://www.naukri.com/finance-jobs'),
    board('Finance', 'foundit · Finance', 'https://www.foundit.in/search/finance-jobs'),
    board('Finance', 'eFinancialCareers India', 'https://www.efinancialcareers.com/jobs/finance/in-india'),
    board('Finance', 'CAclubindia Jobs', 'https://www.caclubindia.com/jobs/jobs_list.asp', 'firecrawl'),
    board('Consulting', 'iimjobs · Consulting', 'https://www.iimjobs.com/c/consulting-general-mgmt-jobs', 'firecrawl'),
    board('Consulting', 'Naukri · Consulting', 'https://www.naukri.com/management-consulting-jobs'),
    board('Consulting', 'LinkedIn · Consulting', 'https://in.linkedin.com/jobs/strategy-consultant-jobs'),
    board('Consulting', 'foundit · Consulting', 'https://www.foundit.in/search/management-consultant-jobs'),
  ]
}

const urlKey = (u: unknown) => (typeof u === 'string' && u ? `u:${u.trim().toLowerCase().replace(/\/+$/, '')}` : null)
const nameKey = (n: unknown) => (typeof n === 'string' && n ? `n:${n.trim().toLowerCase()}` : null)

function listSeq(doc: Document.Parsed, key: Lists): YAMLSeq {
  let seq = doc.get(key, true)
  if (!isSeq(seq)) { doc.set(key, doc.createNode([])); seq = doc.get(key, true) }
  const s = seq as YAMLSeq
  // A flow `[ {…} ]` list (what an empty `[]` grows into) can't hold commented block entries.
  s.flow = false
  for (const item of s.items) if (isMap(item)) item.flow = false
  return s
}

/** Merge the presets the user doesn't have yet (by URL or name). Returns how many were added. */
export function seedDefaults(doc: Document.Parsed, presets: TrackedCompany[]): number {
  const have = new Set<string>()
  for (const key of ['tracked_companies', 'job_boards'] as const) {
    for (const e of ((doc.toJS() ?? {}) as Record<string, unknown>)[key] as Array<Record<string, unknown>> ?? []) {
      for (const k of [urlKey(e?.careers_url), nameKey(e?.name)]) if (k) have.add(k)
    }
  }
  const tracked = listSeq(doc, 'tracked_companies')
  let added = 0
  for (const p of presets) {
    const keys = [urlKey(p.careers_url), nameKey(p.name)].filter((k): k is string => k !== null)
    if (!keys.length || keys.some(k => have.has(k))) continue
    keys.forEach(k => have.add(k))
    tracked.add(doc.createNode(p))
    added++
  }
  return added
}

/** Entries that came from Careerloom's old defaults (career-ops' example list, the old Indeed/Glassdoor
 *  presets) — what "Switch to the India starter pack" removes. The user's own boards never match. */
export function oldDefaultKeys(exampleText: string): Set<string> {
  const keys = new Set(['n:indeed', 'n:glassdoor'])
  const example = (parseDocument(exampleText).toJS() ?? {}) as Record<string, unknown>
  for (const key of ['tracked_companies', 'job_boards'] as const) {
    for (const e of (example[key] as Array<Record<string, unknown>> | undefined) ?? []) {
      for (const k of [urlKey(e?.careers_url), nameKey(e?.name)]) if (k) keys.add(k)
    }
  }
  return keys
}
export const isOldDefault = (keys: Set<string>, e: { name?: unknown; careers_url?: unknown }) =>
  [urlKey(e.careers_url), nameKey(e.name)].some(k => k !== null && keys.has(k))
