// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { SearchError, type SearchBackend } from './adapter'
import { createBraveBackend } from './brave'
import { createExaBackend } from './exa'
import { createFakeBackend } from './fake'
import { createSerperBackend } from './serper'
import { createSearxngBackend } from './searxng'

type Seen = { url: string; init: RequestInit }
const reply = (body: unknown, status = 200) => { const seen: Seen[] = []; const f = (async (url: string, init: RequestInit) => { seen.push({ url: String(url), init }); return new Response(JSON.stringify(body), { status }) }) as unknown as typeof fetch; return { f, seen } }
const sig = () => new AbortController().signal
const KEY = 'sk-test-secret-key-1234567890'
const many = (n: number, shape: (i: number) => object) => Array.from({ length: n }, (_, i) => shape(i))

// Response shapes copied from each provider's documented JSON (research-notes/B2 §1).
const CASES: Array<{ name: string; make: (f: typeof fetch) => SearchBackend; body: (rows: object[]) => unknown; row: (i: number, url?: string) => object; check: (s: Seen) => void }> = [
  { name: 'brave', make: f => createBraveBackend({ key: KEY, fetch: f }), body: rows => ({ type: 'search', web: { type: 'search', results: rows } }), row: (i, url) => ({ title: `T${i}`, url: url ?? `https://e.example/${i}`, description: 'd'.repeat(500), age: '2 days ago' }),
    check: s => { expect(s.url).toMatch(/^https:\/\/api\.search\.brave\.com\/res\/v1\/web\/search\?q=.+&count=10$/); expect((s.init.headers as Record<string, string>)['x-subscription-token']).toBe(KEY) } },
  { name: 'exa', make: f => createExaBackend({ key: KEY, fetch: f }), body: rows => ({ requestId: 'r1', results: rows }), row: (i, url) => ({ title: `T${i}`, url: url ?? `https://e.example/${i}`, publishedDate: '2026-01-01', text: 't'.repeat(500), highlights: ['h'.repeat(300)] }),
    check: s => { expect(s.url).toBe('https://api.exa.ai/search'); expect(s.init.method).toBe('POST'); expect(JSON.parse(String(s.init.body))).toMatchObject({ numResults: 10, type: 'auto' }); expect((s.init.headers as Record<string, string>)['x-api-key']).toBe(KEY) } },
  { name: 'serper', make: f => createSerperBackend({ key: KEY, fetch: f }), body: rows => ({ searchParameters: { q: 'x' }, organic: rows }), row: (i, url) => ({ title: `T${i}`, link: url ?? `https://e.example/${i}`, snippet: 's'.repeat(500), position: i }),
    check: s => { expect(s.url).toBe('https://google.serper.dev/search'); expect(JSON.parse(String(s.init.body))).toMatchObject({ num: 10 }); expect((s.init.headers as Record<string, string>)['x-api-key']).toBe(KEY) } },
  { name: 'searxng', make: f => createSearxngBackend({ baseUrl: 'http://127.0.0.1:8080/', fetch: f }), body: rows => ({ query: 'x', results: rows }), row: (i, url) => ({ title: `T${i}`, url: url ?? `https://e.example/${i}`, content: 'c'.repeat(500), engine: 'duckduckgo' }),
    check: s => { expect(s.url).toMatch(/^http:\/\/127\.0\.0\.1:8080\/search\?q=.+&format=json$/) } },
]

describe.each(CASES)('$name adapter contract', c => {
  it('maps the documented shape, caps at 10 and 200-char snippets, drops non-http(s)', async () => {
    const { f, seen } = reply(c.body([...many(14, i => c.row(i)), c.row(99, 'javascript:alert(1)'), c.row(98, 'ftp://x/y')]))
    const out = await c.make(f).search('react interview', sig())
    expect(out).toHaveLength(10)
    expect(out[0]).toMatchObject({ url: 'https://e.example/0', title: 'T0' })
    expect(out.every(r => r.snippet.length <= 200 && /^https?:/.test(r.url))).toBe(true)
    c.check(seen[0]!)
  })
  it('skips junk rows and tolerates an empty/odd body', async () => {
    expect(await c.make(reply(c.body(['junk', null, 5] as unknown as object[])).f).search('q', sig())).toEqual([])
    expect(await c.make(reply({}).f).search('q', sig())).toEqual([])
  })
  it('errors carry the status, never the key or the body', async () => {
    for (const status of [401, 429, 500]) {
      const err = await c.make(reply({ error: `bad ${KEY}` }, status).f).search('q', sig()).catch(e => e as SearchError)
      expect(err).toBeInstanceOf(SearchError)
      expect((err as SearchError).status).toBe(status)
      expect((err as SearchError).message).not.toContain(KEY)
    }
    const down = await c.make((async () => { throw new TypeError(`connect ECONNREFUSED ${KEY}`) }) as unknown as typeof fetch).search('q', sig()).catch(e => e as SearchError)
    expect((down as SearchError).status).toBeNull()
    expect((down as SearchError).message).not.toContain(KEY)
  })
  it('prices are non-negative constants', () => { expect(c.make(reply({}).f).usdPerCall).toBeGreaterThanOrEqual(0) })
})

describe('searxng and fake', () => {
  it('searxng needs its address', async () => { await expect(createSearxngBackend({}).search('q', sig())).rejects.toThrow(/address/) })
  it('searxng is free, the paid ones are not', () => {
    expect(createSearxngBackend({ baseUrl: 'http://localhost:1' }).usdPerCall).toBe(0)
    expect(createBraveBackend({}).usdPerCall).toBe(0.005)
  })
  it('fake: records calls, serves by map or function, fails on demand, honours abort', async () => {
    const b = createFakeBackend({ results: { a: [{ url: 'https://x.example', title: 't', snippet: 's' }] }, failOn: n => (n === 3 ? new Error('boom') : null) })
    expect(await b.search('a', sig())).toHaveLength(1)
    expect(await b.search('zzz', sig())).toEqual([])
    await expect(b.search('a', sig())).rejects.toThrow('boom')
    expect(b.calls).toEqual(['a', 'zzz', 'a'])
    const ac = new AbortController(); ac.abort()
    await expect(b.search('a', ac.signal)).rejects.toBeDefined()
    expect(await createFakeBackend({ results: q => [{ url: `https://${q}.example`, title: q, snippet: '' }] }).search('k', sig())).toHaveLength(1)
  })
})
