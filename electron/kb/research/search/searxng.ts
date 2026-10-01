import { requestJson, toResults, type AdapterOpts, type SearchBackend } from './adapter'

/** Self-hosted SearXNG (AGPL, a separate user-run process; `format=json` must be enabled on the instance). Free, best effort: engines get suspended under load. */
export const createSearxngBackend = (opts: AdapterOpts): SearchBackend => ({
  id: 'searxng',
  usdPerCall: 0,
  async search(query, signal) {
    if (!opts.baseUrl) throw new Error('SearXNG needs its address in Settings')
    const url = `${opts.baseUrl.replace(/\/+$/, '')}/search?${new URLSearchParams({ q: query, format: 'json' })}`
    const body = await requestJson('SearXNG', opts.fetch ?? fetch, url, { headers: { accept: 'application/json' } }, signal)
    return toResults((body as { results?: unknown })?.results, r => ({ url: r.url, title: r.title, snippet: r.content }))
  },
})
