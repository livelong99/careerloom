import { requestJson, toResults, type AdapterOpts, type SearchBackend } from './adapter'

/** Serper Google SERP, ≈ $1.00 per 1,000 credits at the entry tier (asOf 2026-10-01, secondary source: verify). */
export const createSerperBackend = (opts: AdapterOpts): SearchBackend => ({
  id: 'serper',
  usdPerCall: 0.001,
  async search(query, signal) {
    const body = await requestJson('Serper', opts.fetch ?? fetch, `${opts.baseUrl ?? 'https://google.serper.dev'}/search`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': opts.key ?? '' }, body: JSON.stringify({ q: query, num: 10 }),
    }, signal)
    return toResults((body as { organic?: unknown })?.organic, r => ({ url: r.link, title: r.title, snippet: r.snippet }))
  },
})
