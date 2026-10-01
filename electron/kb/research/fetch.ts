// WP2 owns this file. http → raw CDP → Firecrawl, with SSRF guard, robots and 1 req/s/host (plan §3.2 step 4).
import { todo } from '../todo'

export type FetchedPage = { url: string; status: number; text: string; contentHash: string }
export const fetchPage = (_url: string, _signal: AbortSignal): Promise<FetchedPage | null> => todo('WP2')
