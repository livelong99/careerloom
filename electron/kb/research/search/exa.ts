import { requestJson, toResults, type AdapterOpts, type SearchBackend } from './adapter'

/** Exa auto search, $7 per 1,000 (asOf 2026-10-01). */
export const createExaBackend = (opts: AdapterOpts): SearchBackend => ({
  id: 'exa',
  usdPerCall: 0.007,
  async search(query, signal) {
    const body = await requestJson('Exa', opts.fetch ?? fetch, `${opts.baseUrl ?? 'https://api.exa.ai'}/search`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-api-key': opts.key ?? '' }, body: JSON.stringify({ query, numResults: 10, type: 'auto' }),
    }, signal)
    return toResults((body as { results?: unknown })?.results, r => ({ url: r.url, title: r.title, snippet: Array.isArray(r.highlights) ? r.highlights[0] : r.text ?? r.summary }))
  },
})
