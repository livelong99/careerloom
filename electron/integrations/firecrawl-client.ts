// Pure Firecrawl helpers: URL/IP validation, the compose CLI's argv shape, and
// the scrape request/response bodies. No `electron` import — testable directly
// (ported from autoshorts' firecrawl/{mod,client,stack}.rs).
import { isIP } from 'node:net'
import fs from 'node:fs'
import path from 'node:path'

import { FIRECRAWL_PROJECT } from './firecrawl-compose'

export const DEFAULT_URL = 'http://127.0.0.1:3002'
const MAX_URL_LEN = 2048

function clip(text: string, len = 120): string {
  return text.length > len ? `${text.slice(0, len)}…` : text
}

function stripBrackets(h: string): string {
  return h.startsWith('[') && h.endsWith(']') ? h.slice(1, -1) : h
}

function ipv4Parts(h: string): [number, number, number, number] | null {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(h)
  if (!m) return null
  const parts = m.slice(1, 5).map(Number)
  return parts.every(p => p <= 255) ? (parts as [number, number, number, number]) : null
}

function isPrivateIPv4(parts: [number, number, number, number]): boolean {
  const [a, b] = parts
  if (a === 0) return true // 0.0.0.0/8 "this network"
  if (a === 10) return true // 10.0.0.0/8
  if (a === 127) return true // 127.0.0.0/8 loopback
  if (a === 100 && b >= 64 && b <= 127) return true // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return true // 169.254.0.0/16 link-local
  if (a === 172 && b >= 16 && b <= 31) return true // 172.16.0.0/12
  if (a === 192 && b === 168) return true // 192.168.0.0/16
  if (a >= 224) return true // 224.0.0.0/4 multicast + 240.0.0.0/4 reserved
  return false
}

/** Node's `URL` always canonicalizes IPv6 to compressed hex-group form (no
 *  embedded dotted quad, `::` used once), so expansion only ever has to
 *  handle hex groups. */
function expandIPv6Groups(addr: string): number[] {
  const [left, right] = addr.includes('::') ? addr.split('::') : [addr, undefined]
  const parse = (s: string) => (s ? s.split(':').filter(Boolean).map(g => parseInt(g, 16)) : [])
  const leftParts = parse(left)
  if (right === undefined) return leftParts
  const rightParts = parse(right)
  const missing = 8 - leftParts.length - rightParts.length
  return [...leftParts, ...Array(Math.max(missing, 0)).fill(0), ...rightParts]
}

/** The embedded IPv4 address of an `::ffff:0:0/96` (IPv4-mapped) address, or null. */
function mappedIPv4(groups: number[]): [number, number, number, number] | null {
  if (groups.length !== 8 || !groups.slice(0, 5).every(g => g === 0) || groups[5] !== 0xffff) return null
  return [groups[6] >> 8, groups[6] & 0xff, groups[7] >> 8, groups[7] & 0xff]
}

function isPrivateIPv6(h: string): boolean {
  const groups = expandIPv6Groups(h)
  if (groups.length !== 8 || groups.some(g => Number.isNaN(g))) return false
  if (groups.every(g => g === 0)) return true // ::
  if (groups.slice(0, 7).every(g => g === 0) && groups[7] === 1) return true // ::1
  if ((groups[0] & 0xfe00) === 0xfc00) return true // fc00::/7 unique-local
  if ((groups[0] & 0xffc0) === 0xfe80) return true // fe80::/10 link-local
  const mapped = mappedIPv4(groups)
  return mapped !== null && isPrivateIPv4(mapped)
}

/** True for loopback, RFC 1918, CGNAT, link-local, unique-local, multicast and
 *  reserved addresses — a hostname that ISN'T a literal IP (an ordinary domain
 *  name) is never "private" by this check alone; see the DNS-resolution guard
 *  in firecrawl.ts for that. */
export function isPrivateHost(hostname: string): boolean {
  const h = stripBrackets(hostname).toLowerCase()
  if (h === 'localhost') return true
  const v4 = ipv4Parts(h)
  if (v4) return isPrivateIPv4(v4)
  if (isIP(h) === 6) return isPrivateIPv6(h)
  return false
}

/** The Firecrawl API base must stay on this machine: only a loopback http(s)
 *  address is accepted, so scrape traffic never leaves it. */
export function parseBaseUrl(raw: string): URL {
  let url: URL
  try { url = new URL(raw.trim()) } catch { throw new Error(`FIRECRAWL_URL is not a URL: ${clip(raw)}`) }
  const h = stripBrackets(url.hostname).toLowerCase()
  const v4 = ipv4Parts(h)
  const v6Groups = isIP(h) === 6 ? expandIPv6Groups(h) : null
  const v6Loopback = v6Groups !== null && ((v6Groups.slice(0, 7).every(g => g === 0) && v6Groups[7] === 1) || (mappedIPv4(v6Groups)?.[0] === 127))
  const loopback = h === 'localhost' || (v4 !== null && v4[0] === 127) || v6Loopback
  if ((url.protocol !== 'http:' && url.protocol !== 'https:') || !loopback || url.username) {
    throw new Error(`FIRECRAWL_URL must be a local address like ${DEFAULT_URL}, not ${clip(raw)}.`)
  }
  return url
}

/** A page Firecrawl is asked to fetch: any http(s) URL, as long as it doesn't
 *  point at this machine or a private network (SSRF). Credentials refused.
 *  A named host's DNS resolution is checked separately (firecrawl.ts), since
 *  that needs a live lookup and can't be pure. */
export function validateScrapeTarget(raw: string): URL {
  if (raw.length > MAX_URL_LEN) throw new Error(`The URL is too long (${raw.length} characters).`)
  let url: URL
  try { url = new URL(raw.trim()) } catch { throw new Error(`Not a URL: ${clip(raw)}`) }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') throw new Error(`Only http(s) pages can be scraped: ${clip(raw)}`)
  if (url.username || url.password) throw new Error(`URLs with credentials are refused: ${clip(raw)}`)
  if (isPrivateHost(url.hostname)) throw new Error(`Private and loopback addresses are refused: ${clip(raw)}`)
  return url
}

export type ScrapeOptions = { formats?: Array<'markdown' | 'rawHtml' | 'links'>; onlyMainContent?: boolean }

export function scrapeBody(target: URL, opts: ScrapeOptions = {}): { url: string; formats: string[]; onlyMainContent: boolean } {
  return { url: target.toString(), formats: opts.formats ?? ['markdown'], onlyMainContent: opts.onlyMainContent ?? true }
}

/** `rawHtml`/`links` are present only when those formats were requested. */
export type ScrapedPage = { markdown: string; title: string | null; url: string; rawHtml?: string; links?: string[] }

/** Parses a `/v1/scrape` response's `data` block. */
export function parseScrapeResponse(value: unknown, fallbackUrl: string): ScrapedPage {
  const root = (value ?? {}) as { data?: { markdown?: unknown; rawHtml?: unknown; links?: unknown; metadata?: { title?: unknown; sourceURL?: unknown; url?: unknown } } }
  const data = root.data ?? {}
  const meta = data.metadata ?? {}
  return {
    markdown: typeof data.markdown === 'string' ? data.markdown : '',
    title: typeof meta.title === 'string' ? meta.title : null,
    url: (typeof meta.sourceURL === 'string' && meta.sourceURL) || (typeof meta.url === 'string' && meta.url) || fallbackUrl,
    ...(typeof data.rawHtml === 'string' ? { rawHtml: data.rawHtml } : {}),
    ...(Array.isArray(data.links) ? { links: data.links.filter((l): l is string => typeof l === 'string') } : {}),
  }
}

/** `docker compose -p careerloom-firecrawl [-f -] <verb…>` — the compose file
 *  is only needed (and piped on stdin) for `up`/`pull`. */
export function composeArgs(verb: string[], projectDir: string | null): { args: string[]; needsStdin: boolean } {
  const needsStdin = projectDir === null && (verb[0] === 'up' || verb[0] === 'pull')
  const args = projectDir ? ['compose', ...verb] : ['compose', '-p', FIRECRAWL_PROJECT, ...(needsStdin ? ['-f', '-'] : []), ...verb]
  return { args, needsStdin }
}

const COMPOSE_FILENAMES = ['docker-compose.yml', 'docker-compose.yaml', 'compose.yml', 'compose.yaml']

/** `''` (bundled) always passes. A configured override must be an absolute,
 *  existing directory that actually has a compose file — checked again right
 *  before every use (`firecrawl.ts`), not just when it's saved. */
export function validateComposeDir(dir: string): void {
  if (dir === '') return
  if (!path.isAbsolute(dir)) throw new Error(`The compose folder must be an absolute path: ${dir}`)
  let stat
  try { stat = fs.statSync(dir) } catch { throw new Error(`The compose folder does not exist: ${dir}`) }
  if (!stat.isDirectory()) throw new Error(`Not a folder: ${dir}`)
  if (!COMPOSE_FILENAMES.some(f => fs.existsSync(path.join(dir, f)))) {
    throw new Error(`${dir} has no docker-compose.yml/yaml or compose.yml/yaml`)
  }
}
