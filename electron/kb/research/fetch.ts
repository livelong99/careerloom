// http → raw CDP → Firecrawl, with SSRF guard, robots and 1 req/s/host (plan §3.2 step 4, §9). Every hop of every redirect is
// re-validated (https only, never-fetch list, source toggles, DNS resolution, robots). Page text is returned, never stored.
import { createHash } from 'node:crypto'

import { validateScrapeTarget } from '../../integrations/firecrawl-client'
import type { ResearchSourceGroup } from '../types'
import { classifyHost } from '../sources'
import { robotsAllows } from './robots'

export type HttpResponse = { status: number; location: string | null; /** seconds */ retryAfter: number | null; contentType: string; text(): Promise<string> }
export type FetchDeps = {
  /** One request, redirects NOT followed. */
  http(url: string, signal: AbortSignal): Promise<HttpResponse>
  /** Throws when the host resolves to a private address (DNS-rebinding guard). */
  resolve(host: string): Promise<void>
  cdp?(url: string, signal: AbortSignal): Promise<string>
  firecrawl?(url: string, signal: AbortSignal): Promise<string>
  now(): number
  sleep(ms: number, signal: AbortSignal): Promise<void>
  userAgent: string
  company?: string
  /** Source groups the user left on; undefined = all. The never-fetch list ignores this. */
  enabledGroups?: ReadonlySet<ResearchSourceGroup>
}
export type FetchedPage = { url: string; status: number; text: string; contentHash: string; via: 'http' | 'cdp' | 'firecrawl' }
export type SkipReason = 'denied' | 'robots' | 'ssrf' | 'http' | 'empty' | 'invalid'
export type FetchOutcome = { ok: true; page: FetchedPage } | { ok: false; reason: SkipReason; detail: string }

export const MAX_BYTES = 2 * 1024 * 1024
export const MAX_CHARS = 12_000
const MAX_HOPS = 4
const HOST_GAP_MS = 1000
const THIN = 200
const RETRY_CAP_S = 5

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const decode = (s: string): string => s.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
  if (e[0] === '#') { const n = e[1]?.toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : ' ' }
  return ENTITIES[e.toLowerCase()] ?? m
})

/** FAQPage / QAPage questions from JSON-LD (the cheap structured tier), appended as plain lines. */
function jsonLdQuestions(html: string): string[] {
  const out: string[] = []
  for (const m of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try {
      const walk = (v: unknown): void => {
        if (Array.isArray(v)) return v.forEach(walk)
        if (typeof v !== 'object' || v === null) return
        const o = v as Record<string, unknown>
        if (o['@type'] === 'Question' && typeof o.name === 'string') out.push(o.name)
        Object.values(o).forEach(walk)
      }
      walk(JSON.parse(m[1] ?? ''))
    } catch { /* malformed JSON-LD is ignored */ }
  }
  return out
}

export function htmlToText(html: string): string {
  const faq = jsonLdQuestions(html)
  const body = html
    .replace(/<(script|style|noscript|svg|template|nav|footer)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\/(p|div|li|h[1-6]|tr|br|section|article)>|<br\s*\/?>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
  const text = decode(body).replace(/[ \t\f\v]+/g, ' ').replace(/ ?\n ?/g, '\n').replace(/\n{3,}/g, '\n\n').trim()
  return (faq.length ? `${text}\n${faq.join('\n')}` : text).slice(0, MAX_CHARS)
}

const hash = (s: string): string => createHash('sha256').update(s).digest('hex').slice(0, 32)
const REDIRECT = new Set([301, 302, 303, 307, 308])
const TEXTUAL = /^(text\/|application\/(xhtml\+xml|json|ld\+json))/i

export function createFetcher(deps: FetchDeps): (url: string, signal: AbortSignal) => Promise<FetchOutcome> {
  const nextAt = new Map<string, number>()
  const fail = (reason: SkipReason, detail: string): FetchOutcome => ({ ok: false, reason, detail })

  /** Throws a SkipReason-tagged error for anything that must not be requested. */
  async function check(raw: string): Promise<URL> {
    let u: URL
    try { u = validateScrapeTarget(raw) } catch (e) { throw Object.assign(new Error((e as Error).message), { reason: 'ssrf' as SkipReason }) }
    if (u.protocol !== 'https:') throw Object.assign(new Error('Only https pages are fetched'), { reason: 'ssrf' as SkipReason })
    const c = classifyHost(u.toString(), deps.company)
    if (!c.allowed || (c.group && deps.enabledGroups && !deps.enabledGroups.has(c.group))) throw Object.assign(new Error(c.reason ?? `source group ${c.group} is switched off`), { reason: 'denied' as SkipReason })
    try { await deps.resolve(u.hostname) } catch (e) { throw Object.assign(new Error((e as Error).message), { reason: 'ssrf' as SkipReason }) }
    return u
  }

  /** 1 req/s/host, reserved up front so concurrent callers queue instead of bursting. */
  async function pace(host: string, signal: AbortSignal): Promise<void> {
    const at = Math.max(deps.now(), nextAt.get(host) ?? 0)
    nextAt.set(host, at + HOST_GAP_MS)
    if (at > deps.now()) await deps.sleep(at - deps.now(), signal)
  }

  async function request(u: URL, signal: AbortSignal): Promise<HttpResponse> {
    await pace(u.hostname, signal)
    let res = await deps.http(u.toString(), signal)
    if ((res.status === 429 || res.status === 503) && res.retryAfter !== null) {
      await deps.sleep(Math.min(res.retryAfter, RETRY_CAP_S) * 1000, signal)
      await pace(u.hostname, signal)
      res = await deps.http(u.toString(), signal)
    }
    return res
  }

  async function robotsFile(robotsUrl: string, signal: AbortSignal): Promise<string | null> {
    let u = new URL(robotsUrl)
    for (let hop = 0; hop <= 3; hop++) {
      const res = await request(u, signal)
      if (REDIRECT.has(res.status) && res.location) { u = await check(new URL(res.location, u).toString()); continue }
      if (res.status >= 200 && res.status < 300) return (await res.text()).slice(0, 512 * 1024)
      if (res.status >= 400 && res.status < 500) return null
      throw new Error(`robots.txt unavailable (${res.status})`)
    }
    return null
  }

  return async function fetchPage(url, signal) {
    let u: URL
    try {
      u = await check(url)
      for (let hop = 0; ; hop++) {
        if (!(await robotsAllows(u.toString(), deps.userAgent, r => robotsFile(r, signal), deps.now))) {
          signal.throwIfAborted() // an aborted robots fetch is a stop, not a "disallowed"
          return fail('robots', `robots.txt disallows ${u.hostname}${u.pathname}`)
        }
        const res = await request(u, signal)
        if (REDIRECT.has(res.status) && res.location) {
          if (hop >= MAX_HOPS) return fail('http', 'too many redirects')
          u = await check(new URL(res.location, u).toString())
          continue
        }
        if (res.status < 200 || res.status >= 300) return fail('http', `HTTP ${res.status}`)
        if (!TEXTUAL.test(res.contentType)) return fail('invalid', `not a text page (${res.contentType || 'unknown type'})`)
        const raw = (await res.text()).slice(0, MAX_BYTES)
        let text = /html|xml/i.test(res.contentType) ? htmlToText(raw) : raw.trim().slice(0, MAX_CHARS)
        let via: FetchedPage['via'] = 'http'
        if (text.length < THIN && deps.cdp) { text = (await deps.cdp(u.toString(), signal)).trim().slice(0, MAX_CHARS); via = 'cdp' }
        if (text.length < THIN && deps.firecrawl) { text = (await deps.firecrawl(u.toString(), signal)).trim().slice(0, MAX_CHARS); via = 'firecrawl' }
        if (text.length < THIN) return fail('empty', 'no readable text')
        return { ok: true, page: { url: u.toString(), status: res.status, text, contentHash: hash(text), via } }
      }
    } catch (err) {
      if (signal.aborted) throw err
      const reason = (err as { reason?: SkipReason }).reason
      return fail(reason ?? 'http', (err as Error).message.slice(0, 200))
    }
  }
}

/** Real network: global fetch, no automatic redirects, 2 MB body cap. Wired in service.ts with the real resolver, CDP and Firecrawl. */
export function realHttp(userAgent: string): FetchDeps['http'] {
  return async (url, signal) => {
    const res = await fetch(url, { redirect: 'manual', signal: AbortSignal.any([signal, AbortSignal.timeout(15_000)]), headers: { 'user-agent': userAgent, accept: 'text/html,application/xhtml+xml,text/plain;q=0.8,*/*;q=0.5' } })
    const ra = Number(res.headers.get('retry-after'))
    return {
      status: res.status, location: res.headers.get('location'), retryAfter: Number.isFinite(ra) && ra > 0 ? ra : null, contentType: res.headers.get('content-type') ?? '',
      async text() {
        const reader = res.body?.getReader()
        if (!reader) return ''
        const chunks: Uint8Array[] = []
        let total = 0
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          total += value.byteLength
          chunks.push(value)
          if (total > MAX_BYTES) { await reader.cancel(); break }
        }
        return Buffer.concat(chunks).toString('utf8')
      },
    }
  }
}
