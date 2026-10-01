import { requestJson, toResults, type AdapterOpts, type SearchBackend } from './adapter'

/** Brave Search API, Search plan $5 per 1,000 requests (asOf 2026-10-01). Results are URLs + ≤ 200-char snippets; nothing is stored as a SERP. */
export const createBraveBackend = (opts: AdapterOpts): SearchBackend => ({
  id: 'brave',
  usdPerCall: 0.005,
  async search(query, signal) {
    const url = `${opts.baseUrl ?? 'https://api.search.brave.com'}/res/v1/web/search?${new URLSearchParams({ q: query, count: '10' })}`
    const body = await requestJson('Brave', opts.fetch ?? fetch, url, { headers: { accept: 'application/json', 'x-subscription-token': opts.key ?? '' } }, signal)
    return toResults((body as { web?: { results?: unknown } })?.web?.results, r => ({ url: r.url, title: r.title, snippet: r.description }))
  },
})
