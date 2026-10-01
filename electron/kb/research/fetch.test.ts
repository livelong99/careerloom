// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest'

import { createFetcher, htmlToText, MAX_CHARS, type FetchDeps } from './fetch'
import { clearRobotsCache } from './robots'
import { createFakeWeb, PAGES, URLS } from './fixtures/web'

const sig = () => new AbortController().signal
beforeEach(() => clearRobotsCache())
const setup = (extra: Parameters<typeof createFakeWeb>[0] = {}, over: Partial<FetchDeps> = {}) => { const w = createFakeWeb(extra); return { ...w, fetch: createFetcher({ ...w.deps, company: 'Acme Corp', ...over }) } }
const pageReqs = (c: { http: string[] }) => c.http.filter(u => !u.endsWith('/robots.txt'))

describe('htmlToText', () => {
  it('drops script/style/nav/footer/comments, keeps paragraphs, decodes entities, caps at 12k', () => {
    const t = htmlToText('<html><head><style>x{}</style></head><body><nav>menu</nav><!-- c --><p>A &amp; B &lt;ok&gt; &#65;</p><script>evil()</script><p>Second</p><footer>f</footer></body></html>')
    expect(t).toBe('A & B <ok> A\nSecond')
    expect(htmlToText(`<p>${'x'.repeat(50_000)}</p>`).length).toBe(MAX_CHARS)
  })
  it('appends JSON-LD questions (FAQ/QA pages)', () => {
    const t = htmlToText('<p>hi</p><script type="application/ld+json">{"@type":"FAQPage","mainEntity":[{"@type":"Question","name":"What is a closure?"},{"@type":"Question","name":"What is hoisting?"}]}</script><script type="application/ld+json">{broken</script>')
    expect(t).toContain('What is a closure?')
    expect(t).toContain('What is hoisting?')
  })
})

describe('createFetcher', () => {
  it('fetches an allowed page and returns clean text, a hash and the route taken', async () => {
    const { fetch, counters } = setup()
    const out = await fetch(URLS.so, sig())
    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.page).toMatchObject({ url: URLS.so, status: 200, via: 'http' })
    expect(out.page.text).toContain('Q: Explain how closures')
    expect(out.page.text).not.toMatch(/var x = 1|menu|foot/)
    expect(out.page.contentHash).toMatch(/^[0-9a-f]{32}$/)
    expect(counters.http).toEqual(['https://stackoverflow.com/robots.txt', URLS.so])
  })

  it.each([URLS.reddit, URLS.glassdoor, URLS.linkedin, 'https://medium.com/@x/y', 'https://in.indeed.com/viewjob'])('never fetches %s (no request at all)', async url => {
    const { fetch, counters } = setup()
    const out = await fetch(url, sig())
    expect(out).toMatchObject({ ok: false, reason: 'denied' })
    expect(counters.http).toEqual([])
  })
  it('a redirect to a denied host is stopped at the hop', async () => {
    const { fetch, counters } = setup()
    expect(await fetch(URLS.toDenied, sig())).toMatchObject({ ok: false, reason: 'denied' })
    expect(pageReqs(counters)).toEqual([URLS.toDenied])
  })
  it('SSRF: redirect to a private address, http, credentials, loopback, private ranges', async () => {
    const { fetch, counters } = setup()
    expect(await fetch(URLS.toPrivate, sig())).toMatchObject({ ok: false, reason: 'ssrf' })
    expect(pageReqs(counters)).toEqual([URLS.toPrivate])
    for (const url of ['http://stackoverflow.com/q/1', 'https://user:pw@stackoverflow.com/q/1', 'https://localhost/x', 'https://127.0.0.1/x', 'https://10.0.0.5/x', 'https://[::1]/x', 'https://192.168.1.1/x', 'file:///etc/passwd']) {
      expect(await fetch(url, sig()), url).toMatchObject({ ok: false, reason: 'ssrf' })
    }
    expect(pageReqs(counters)).toEqual([URLS.toPrivate])
  })
  it('SSRF: a public-looking host that resolves to a private address is refused before any request', async () => {
    const { fetch, counters } = setup({ privateHosts: ['rebind.example.org'] })
    expect(await fetch('https://rebind.example.org/p', sig())).toMatchObject({ ok: false, reason: 'ssrf' })
    expect(counters.http).toEqual([])
  })
  it('redirect loops stop after 4 hops', async () => {
    const pages = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [`https://loop.example.org/${i}`, { status: 302, location: `https://loop.example.org/${i + 1}` }]))
    const { fetch } = setup({ pages })
    expect(await fetch('https://loop.example.org/0', sig())).toMatchObject({ ok: false, reason: 'http', detail: 'too many redirects' })
  })

  it('robots.txt: a disallowed path is skipped and the page is never requested; unreachable robots also skips', async () => {
    const { fetch, counters } = setup()
    expect(await fetch(URLS.noRobots, sig())).toMatchObject({ ok: false, reason: 'robots' })
    expect(pageReqs(counters)).toEqual([])
    const down = setup({ robots: {} }, {})
    down.deps.http = async url => (url.endsWith('/robots.txt') ? { status: 503, location: null, retryAfter: null, contentType: 'text/plain', text: async () => '' } : (await createFakeWeb().deps.http(url, sig())))
    clearRobotsCache()
    expect(await createFetcher(down.deps)(URLS.so, sig())).toMatchObject({ ok: false, reason: 'robots' })
  })
  it('respects an allowed path next to a disallowed one (longest match)', async () => {
    const { fetch } = setup()
    expect((await fetch(URLS.so, sig())).ok).toBe(true)
  })

  it('politeness: 1 request per second per host (fake clock), none between hosts', async () => {
    const { fetch, clock } = setup()
    await fetch(URLS.careers, sig())
    const before = clock.slept.length
    await fetch('https://careers.acme-corp.com/other', sig())
    const waits = clock.slept.slice(before)
    expect(waits.length).toBeGreaterThan(0)
    expect(waits.every(w => w <= 1000)).toBe(true)
    const t0 = clock.t
    await fetch(URLS.eng, sig()) // a fresh host: its robots.txt and page are two requests, so exactly one 1 s gap, nothing owed to the other host
    expect(clock.t - t0).toBe(1000)
  })
  it('429/503 with Retry-After backs off once (capped) and retries; without it the page fails', async () => {
    let n = 0
    const w = createFakeWeb()
    const inner = w.deps.http
    const f = createFetcher({ ...w.deps, http: async (url, s) => (url === URLS.blog && n++ === 0 ? { status: 429, location: null, retryAfter: 120, contentType: 'text/html', text: async () => '' } : inner(url, s)) })
    const out = await f(URLS.blog, sig())
    expect(out.ok).toBe(true)
    expect(Math.max(...w.clock.slept)).toBeLessThanOrEqual(5000)
    const g = createFetcher({ ...w.deps, http: async () => ({ status: 429, location: null, retryAfter: null, contentType: 'text/html', text: async () => '' }) })
    expect(await g(URLS.eng, sig())).toMatchObject({ ok: false, reason: 'http', detail: 'HTTP 429' })
  })

  it('http errors, non-text types and thin pages', async () => {
    const { fetch } = setup({ pages: { 'https://img.example.org/a': { type: 'image/png', body: 'x' } } })
    expect(await fetch(URLS.missing, sig())).toMatchObject({ ok: false, reason: 'http' })
    expect(await fetch('https://img.example.org/a', sig())).toMatchObject({ ok: false, reason: 'invalid' })
  })
  it('thin page → raw CDP; CDP empty → Firecrawl; nothing → empty', async () => {
    const a = setup()
    const viaCdp = await a.fetch(URLS.thin, sig())
    expect(viaCdp.ok && viaCdp.page.via).toBe('cdp')
    expect(a.counters.cdp).toEqual([URLS.thin])
    const b = setup({}, { cdp: async () => '', firecrawl: async () => 'Q: ' + 'a readable line from the firecrawl scrape '.repeat(8) })
    const viaFc = await b.fetch(URLS.thin, sig())
    expect(viaFc.ok && viaFc.page.via).toBe('firecrawl')
    const c = setup({}, { cdp: undefined, firecrawl: undefined })
    expect(await c.fetch(URLS.thin, sig())).toMatchObject({ ok: false, reason: 'empty' })
  })
  it('a huge page is capped; page text is only returned, never kept', async () => {
    const { fetch } = setup({ pages: { 'https://big.example.org/p': { body: `<p>${'word '.repeat(2_000_000)}</p>` } } })
    const out = await fetch('https://big.example.org/p', sig())
    expect(out.ok && out.page.text.length).toBe(MAX_CHARS)
  })
  it('source toggles switch a group off; the never-fetch list ignores toggles', async () => {
    const { fetch } = setup({}, { enabledGroups: new Set(['github', 'articles', 'companyPages']) })
    expect(await fetch(URLS.so, sig())).toMatchObject({ ok: false, reason: 'denied' })
    expect((await fetch(URLS.gh, sig())).ok).toBe(true)
    const all = setup({}, { enabledGroups: new Set(['stackexchange', 'github', 'taxonomy', 'hn', 'companyPages', 'articles']) })
    expect(await all.fetch(URLS.reddit, sig())).toMatchObject({ ok: false, reason: 'denied' })
  })
  it('abort propagates instead of becoming a skip', async () => {
    const ac = new AbortController()
    const w = createFakeWeb()
    const f = createFetcher({ ...w.deps, http: async () => { ac.abort(); throw new DOMException('aborted', 'AbortError') } })
    await expect(f(URLS.blog, ac.signal)).rejects.toBeDefined()
  })
  it('fixtures stay synthetic: no real brand names beyond the fake hosts', () => {
    expect(JSON.stringify(PAGES)).not.toMatch(/glassdoor.*(salary|review)/i)
  })
})
