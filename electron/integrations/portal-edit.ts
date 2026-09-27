// Boards editor: strict validation of an edit coming over IPC, before it touches
// portals.yml. No `electron` import — testable directly.
import type { PortalDetail, PortalPatch } from '../contract'
import { validateScrapeTarget } from './firecrawl-client'
import type { Source, SourcePatch } from './sources'
import { boardUrls } from './web-board-core'

const MAX_URLS = 5
const NAME_RE = /^[^\n|#-][^\n|]{0,99}$/
const PROVIDER_RE = /^[a-z0-9][a-z0-9-]{0,39}$/

export function portalDetail(s: Source, guideline: string | null): PortalDetail {
  return {
    id: s.id, list: s.list ?? 'tracked_companies', name: s.name, urls: boardUrls(s), enabled: s.enabled !== false,
    fetch: s.fetch ?? null, provider: s.provider ?? null, api: s.api ?? null, guideline,
  }
}

/** Unknown input → a safe SourcePatch for `source`. Throws a user-facing message on the first problem. */
export function validatePortalPatch(raw: unknown, source: Source, others: Source[]): SourcePatch {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('Nothing to save')
  const p = raw as PortalPatch & Record<string, unknown>
  const out: SourcePatch = {}
  if (p.name !== undefined) {
    const name = typeof p.name === 'string' ? p.name.replace(/\s+/g, ' ').trim() : ''
    if (!NAME_RE.test(name)) throw new Error('Name: 1–100 characters, not starting with - or #, no |')
    if (name.toLowerCase() !== source.name.toLowerCase() && others.some(o => o.name.toLowerCase() === name.toLowerCase())) throw new Error(`A board named "${name}" already exists`)
    out.name = name
  }
  if (p.urls !== undefined) {
    if (!Array.isArray(p.urls) || !p.urls.length || p.urls.length > MAX_URLS || !p.urls.every(u => typeof u === 'string')) throw new Error(`Give 1–${MAX_URLS} URLs`)
    out.urls = [...new Set((p.urls as string[]).map(u => validateScrapeTarget(u.trim()).href))]
  }
  if (p.enabled !== undefined) {
    if (typeof p.enabled !== 'boolean') throw new Error('enabled must be true or false')
    out.enabled = p.enabled
  }
  if (p.fetch !== undefined) {
    if (!source.fetch) throw new Error('Only web boards have a fetch type')
    if (p.fetch !== 'firecrawl' && p.fetch !== 'browser') throw new Error('Fetch must be Firecrawl or Browser')
    out.fetch = p.fetch
  }
  if (p.provider !== undefined) {
    if (p.provider !== null && (typeof p.provider !== 'string' || !PROVIDER_RE.test(p.provider))) throw new Error('Provider: a career-ops provider id like greenhouse')
    out.provider = p.provider || null
  }
  if (p.api !== undefined) {
    if (p.api !== null && typeof p.api !== 'string') throw new Error('API must be a URL')
    out.api = p.api ? validateScrapeTarget(p.api.trim()).href : null
  }
  return out
}
