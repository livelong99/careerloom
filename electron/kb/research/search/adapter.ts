// Search backend contract (plan §3.2 step 3); adapters: brave, exa, serper, searxng, fake. Response shapes follow each
// provider's documented JSON (research-notes/B2); prices are per-call constants with an `asOf` date, re-verify at release.
import type { SearchBackendId } from '../../types'

export type SearchResult = { url: string; title: string; /** ≤ 200 chars */ snippet: string }
export interface SearchBackend {
  id: SearchBackendId | 'fake'
  /** Price per call in USD (constant with an `asOf` date in the adapter). */
  usdPerCall: number
  search(query: string, signal: AbortSignal): Promise<SearchResult[]>
}
export type AdapterOpts = { key?: string; baseUrl?: string; fetch?: typeof fetch }

/** Carries the HTTP status only: the key and the response body never reach a message. */
export class SearchError extends Error {
  constructor(readonly backend: string, readonly status: number | null, message: string) { super(message) }
}

export const clip = (s: unknown, n = 200): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, n) : '')
const MAX_RESULTS = 10

/** Keeps well-formed http(s) results only, at most 10; the pipeline re-validates every URL again before fetching. */
export function toResults(rows: unknown, pick: (row: Record<string, unknown>) => { url: unknown; title: unknown; snippet: unknown }): SearchResult[] {
  if (!Array.isArray(rows)) return []
  const out: SearchResult[] = []
  for (const row of rows) {
    if (typeof row !== 'object' || row === null) continue
    const { url, title, snippet } = pick(row as Record<string, unknown>)
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) continue
    out.push({ url, title: clip(title, 200), snippet: clip(snippet) })
    if (out.length === MAX_RESULTS) break
  }
  return out
}

export async function requestJson(backend: string, f: typeof fetch, url: string, init: RequestInit, signal: AbortSignal): Promise<unknown> {
  let res: Response
  try { res = await f(url, { ...init, signal }) } catch (err) {
    if (signal.aborted) throw err
    throw new SearchError(backend, null, `${backend} search could not be reached`)
  }
  if (!res.ok) throw new SearchError(backend, res.status, `${backend} search failed (${res.status})`)
  try { return await res.json() } catch { throw new SearchError(backend, res.status, `${backend} search returned unreadable data`) }
}
