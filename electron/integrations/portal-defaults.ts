// Default portals: career-ops' templates/portals.example.yml (tracked_companies +
// job_boards, each keeping its own `enabled`) merged into the user's portals.yml,
// plus Careerloom's browser-board presets (LinkedIn, Naukri, Indeed, Glassdoor),
// disabled. Never overwrites or duplicates the user's entries; comments kept
// (yaml Document API). No `electron` import — testable directly.
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

/** Browser-board presets (disabled): search URLs from the profile, else each site's generic search page. */
export function presetBoards({ role, city, country }: SearchProfile): TrackedCompany[] {
  const where = [city, country].filter(Boolean).join(', ')
  const q = (params: Record<string, string | null>) =>
    new URLSearchParams(Object.entries(params).filter((e): e is [string, string] => Boolean(e[1]))).toString()
  const india = country?.toLowerCase() === 'india'
  const board = (name: string, url: string): TrackedCompany => ({ name, careers_url: url, enabled: false, fetch: 'browser' })
  return [
    board('LinkedIn Jobs', `https://www.linkedin.com/jobs/search/?${q({ keywords: role, location: where || null })}`),
    board('Naukri', role ? `https://www.naukri.com/${slug(role)}-jobs${city ? `-in-${slug(city)}` : ''}` : 'https://www.naukri.com/jobs-in-india'),
    board('Indeed', `https://${india ? 'in' : 'www'}.indeed.com/jobs?${q({ q: role, l: city ?? country })}`),
    board('Glassdoor', `https://www.glassdoor.com/Job/jobs.htm?${q({ 'sc.keyword': role })}`),
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

/** Merge the example's entries (and presets) the user doesn't have yet. Returns how many were added. */
export function seedDefaults(doc: Document.Parsed, exampleText: string, presets: TrackedCompany[]): number {
  const example = parseDocument(exampleText)
  const have = new Set<string>()
  for (const key of ['tracked_companies', 'job_boards'] as const) {
    for (const e of ((doc.toJS() ?? {}) as Record<string, unknown>)[key] as Array<Record<string, unknown>> ?? []) {
      for (const k of [urlKey(e?.careers_url), nameKey(e?.name)]) if (k) have.add(k)
    }
  }
  const fresh = (e: Record<string, unknown>) => {
    const keys = [urlKey(e.careers_url), nameKey(e.name)].filter((k): k is string => k !== null)
    if (!keys.length || keys.some(k => have.has(k))) return false
    keys.forEach(k => have.add(k))
    return true
  }
  let added = 0
  for (const key of ['tracked_companies', 'job_boards'] as const) {
    const source = example.get(key, true)
    if (!isSeq(source)) continue
    const target = listSeq(doc, key)
    source.items.forEach((item, i) => {
      if (!isMap(item) || !fresh(item.toJSON() as Record<string, unknown>)) return
      const copy = item.clone()
      // The first entry's section header comment belongs to the list node, not the entry.
      if (i === 0 && source.commentBefore && !copy.commentBefore) copy.commentBefore = source.commentBefore
      target.add(copy)
      added++
    })
  }
  const tracked = listSeq(doc, 'tracked_companies')
  for (const p of presets) if (fresh(p as Record<string, unknown>)) { tracked.add(doc.createNode(p)); added++ }
  return added
}
