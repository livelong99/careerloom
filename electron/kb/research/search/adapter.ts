// WP2 owns this file. Search backend contract (plan §3.2 step 3); adapters: brave, exa, serper, searxng, fake.
import type { SearchBackendId } from '../../types'

export type SearchResult = { url: string; title: string; /** ≤ 200 chars */ snippet: string }
export interface SearchBackend {
  id: SearchBackendId | 'fake'
  /** Price per call in USD (constant with an `asOf` date in the adapter). */
  usdPerCall: number
  search(query: string, signal: AbortSignal): Promise<SearchResult[]>
}
