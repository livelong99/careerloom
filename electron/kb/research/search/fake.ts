import type { SearchBackend, SearchResult } from './adapter'

export type FakeSearchOpts = {
  /** Query → results; a function sees every query (e.g. to return the same pages for any skill). Missing = no results. */
  results?: Record<string, SearchResult[]> | ((query: string) => SearchResult[])
  usdPerCall?: number
  /** Throws on the n-th call (1-based) to exercise fallback and resume. */
  failOn?: (call: number, query: string) => Error | null
}
/** Deterministic backend for tests and `scripts/kb-research-dry.mjs`; `calls` records every query it was asked. */
export function createFakeBackend(opts: FakeSearchOpts = {}): SearchBackend & { calls: string[] } {
  const calls: string[] = []
  return {
    id: 'fake', usdPerCall: opts.usdPerCall ?? 0.005, calls,
    async search(query, signal) {
      signal.throwIfAborted()
      calls.push(query)
      const err = opts.failOn?.(calls.length, query)
      if (err) throw err
      const r = opts.results
      return typeof r === 'function' ? r(query) : r?.[query] ?? []
    },
  }
}
