// Web boards (any job listing page): the pure half — robots.txt, schema.org
// JobPosting JSON-LD, next-page links, strict validation of the agent's JSON,
// and the temp portals.yml that hands the result to career-ops' local-parser.
// No `electron` import — testable directly.
import { parseDocument } from 'yaml'

import type { WebBoardJob } from '../contract'
import { normUrl, subsetPortalsYaml } from '../jobs-data'
import { isPrivateHost } from './firecrawl-client'
import type { Source, TrackedCompany } from './sources'

export const MAX_JOBS = 200
export const MAX_PAGES = 3
const ROBOTS_AGENT = 'careerloom'
const CAP = { title: 300, company: 200, short: 200, snippet: 500 }

export type WebJob = WebBoardJob

export const isWebBoard = (s: TrackedCompany): boolean => s.fetch === 'firecrawl' || s.fetch === 'browser'
export const boardUrls = (s: TrackedCompany): string[] =>
  s.listing_urls?.length ? s.listing_urls : s.careers_url ? [s.careers_url] : []

// ————— robots.txt (RFC 9309: our group or `*`, longest match wins, Allow wins ties) —————

type Rule = { allow: boolean; pattern: string }

function robotsRules(text: string, agent: string): Rule[] {
  const groups: Array<{ agents: string[]; rules: Rule[] }> = []
  let current: { agents: string[]; rules: Rule[] } | null = null
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*([a-z-]+)\s*:\s*(.*?)\s*$/i.exec(raw.replace(/#.*/, ''))
    if (!m) continue
    const key = m[1]!.toLowerCase()
    const value = m[2]!
    if (key === 'user-agent') {
      if (!current || current.rules.length) groups.push(current = { agents: [], rules: [] })
      current.agents.push(value.toLowerCase())
    } else if ((key === 'allow' || key === 'disallow') && current && value) {
      current.rules.push({ allow: key === 'allow', pattern: value })
    }
  }
  const mine = groups.filter(g => g.agents.some(a => a !== '*' && agent.includes(a)))
  return (mine.length ? mine : groups.filter(g => g.agents.includes('*'))).flatMap(g => g.rules)
}

function patternMatches(pattern: string, target: string): boolean {
  const anchored = pattern.endsWith('$')
  const body = (anchored ? pattern.slice(0, -1) : pattern).split('*').map(s => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*')
  return new RegExp(`^${body}${anchored ? '$' : ''}`).test(target)
}

/** May `url` be fetched under this robots.txt? */
export function robotsAllows(robotsTxt: string, url: string, agent = ROBOTS_AGENT): boolean {
  const u = new URL(url)
  const target = `${u.pathname}${u.search}`
  let best: Rule | null = null
  for (const rule of robotsRules(robotsTxt, agent)) {
    if (!patternMatches(rule.pattern, target)) continue
    if (!best || rule.pattern.length > best.pattern.length || (rule.pattern.length === best.pattern.length && rule.allow)) best = rule
  }
  return best?.allow ?? true
}

// ————— Validation (shared by JSON-LD and the agent's JSON) —————

const text = (v: unknown, cap: number): string =>
  typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, cap) : typeof v === 'number' ? String(v) : ''
const orNull = (s: string) => s || null

function absoluteUrl(v: unknown, base: string): string | null {
  if (typeof v !== 'string' || !v.trim() || v.length > 2048) return null
  let u: URL
  try { u = new URL(v.trim(), base) } catch { return null }
  if ((u.protocol !== 'https:' && u.protocol !== 'http:') || u.username || u.password || isPrivateHost(u.hostname)) return null
  u.hash = ''
  return u.href
}

/** Strict: `{jobs:[…]}` (or a bare array) → trimmed, absolute http(s) URLs (relative ones
 *  resolved against the page), no junk, deduped by URL, capped at MAX_JOBS. With `known`
 *  (every link on the scraped pages), a URL the page never linked is dropped as invented. */
export function validateJobs(raw: unknown, pageUrl: string, known?: Set<string>): WebJob[] {
  const list = Array.isArray(raw) ? raw : (raw as { jobs?: unknown } | null)?.jobs
  if (!Array.isArray(list)) return []
  const seen = new Set<string>()
  const out: WebJob[] = []
  for (const item of list) {
    if (out.length >= MAX_JOBS) break
    if (!item || typeof item !== 'object') continue
    const j = item as Record<string, unknown>
    const title = text(j.title, CAP.title)
    const url = absoluteUrl(j.url, pageUrl)
    if (!title || !url) continue
    const key = normUrl(url)
    if (seen.has(key) || (known?.size && !known.has(key))) continue
    seen.add(key)
    out.push({
      title, url,
      company: text(j.company, CAP.company),
      location: text(j.location, CAP.short),
      posted_at: orNull(text(j.posted_at, 40)),
      salary: orNull(text(j.salary, CAP.short)),
      employment_type: orNull(text(j.employment_type, 60)),
      remote: typeof j.remote === 'boolean' ? j.remote : null,
      description_snippet: text(j.description_snippet, CAP.snippet),
    })
  }
  return out
}

// ————— Page parsing —————

/** Every link on a scraped page (Firecrawl's `links` + markdown links), normalized. */
export function pageLinks(page: { url: string; markdown: string; links?: string[] }): Set<string> {
  const hrefs = [...(page.links ?? []), ...[...page.markdown.matchAll(/\]\(\s*<?([^)\s>]+)>?(?:\s+"[^"]*")?\s*\)/g)].map(m => m[1]!)]
  return new Set(hrefs.map(h => absoluteUrl(h, page.url)).filter((u): u is string => u !== null).map(normUrl))
}

const NEXT_TEXT = /^\s*(?:next(?: page)?|more jobs|older(?: jobs| posts)?|›|»|→|>)\s*[›»→>]?\s*$/i

/** The page's "next page" link on the same site (rel=next, else a Next/›/» link), or null. */
export function nextPageUrl(page: { url: string; markdown: string; rawHtml?: string }, visited: Set<string>): string | null {
  const origin = new URL(page.url).origin
  const candidates = [
    ...[...(page.rawHtml ?? '').matchAll(/<(?:link|a)\b[^>]*\brel=["']?next["']?[^>]*>/gi)].map(m => /\bhref=["']([^"']+)["']/i.exec(m[0])?.[1]),
    ...[...page.markdown.matchAll(/\[([^\]]{1,20})\]\(\s*<?([^)\s>]+)>?[^)]*\)/g)].filter(m => NEXT_TEXT.test(m[1]!)).map(m => m[2]),
  ]
  for (const href of candidates) {
    const url = absoluteUrl(href?.replaceAll('&amp;', '&'), page.url)
    if (url && new URL(url).origin === origin && !visited.has(normUrl(url))) return url
  }
  return null
}

const stripTags = (html: string) => html.replace(/<[^>]*>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&')
const names = (v: unknown): string[] => (Array.isArray(v) ? v : [v]).flatMap(x =>
  typeof x === 'string' ? [x] : x && typeof x === 'object' && typeof (x as { name?: unknown }).name === 'string' ? [(x as { name: string }).name] : [])

function placeOf(loc: unknown): string {
  const address = (loc as { address?: unknown } | null)?.address
  if (typeof address === 'string') return address
  const a = (address ?? {}) as Record<string, unknown>
  return [a.addressLocality, a.addressRegion, ...names(a.addressCountry)].filter(x => typeof x === 'string' && x).join(', ')
}

function salaryOf(v: unknown): string {
  const s = (v ?? {}) as { currency?: unknown; value?: unknown }
  const val = (typeof s.value === 'object' && s.value ? s.value : { value: s.value }) as Record<string, unknown>
  const amount = val.minValue !== undefined ? `${val.minValue}–${val.maxValue ?? ''}` : val.value
  return amount === undefined || amount === null ? '' : [s.currency, amount, val.unitText].filter(x => x !== undefined && x !== '').join(' ')
}

function postingToJob(p: Record<string, unknown>): Record<string, unknown> {
  const locations = (Array.isArray(p.jobLocation) ? p.jobLocation : [p.jobLocation]).map(placeOf).filter(Boolean)
  const remote = p.jobLocationType === 'TELECOMMUTE' ? true : null
  return {
    title: p.title ?? p.name,
    url: p.url ?? p.sameAs ?? (p.mainEntityOfPage as { '@id'?: unknown } | undefined)?.['@id'] ?? p['@id'],
    company: names(p.hiringOrganization)[0] ?? '',
    location: locations.join(' / ') || names(p.applicantLocationRequirements).join(', ') || (remote ? 'Remote' : ''),
    posted_at: p.datePosted,
    salary: salaryOf(p.baseSalary),
    employment_type: Array.isArray(p.employmentType) ? p.employmentType.join(', ') : p.employmentType,
    remote,
    description_snippet: typeof p.description === 'string' ? stripTags(p.description) : '',
  }
}

/** schema.org JobPosting objects in the page's JSON-LD (incl. @graph and ItemList wrappers). */
export function jsonLdJobs(html: string, pageUrl: string): WebJob[] {
  return validateJobs(jsonLdPostings(html).map(postingToJob), pageUrl)
}

/** Raw schema.org JobPosting objects from the page's JSON-LD (full descriptions, uncapped). */
export function jsonLdPostings(html: string): Record<string, unknown>[] {
  const found: Record<string, unknown>[] = []
  const walk = (node: unknown, depth: number): void => {
    if (!node || typeof node !== 'object' || depth > 6) return
    if (Array.isArray(node)) { node.forEach(n => walk(n, depth + 1)); return }
    const o = node as Record<string, unknown>
    const type = o['@type']
    if (type === 'JobPosting' || (Array.isArray(type) && type.includes('JobPosting'))) { found.push(o); return }
    for (const key of ['@graph', 'itemListElement', 'item', 'mainEntity']) walk(o[key], depth + 1)
  }
  for (const m of html.matchAll(/<script\b[^>]*type=["']?application\/ld\+json["']?[^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1]!), 0) } catch { /* malformed block: skip it, keep the rest */ }
  }
  return found
}

/** One JobPosting as a plain-text JD for the evaluation worker. */
export function postingText(p: Record<string, unknown>, toText: (html: string) => string): string {
  const j = postingToJob(p)
  const line = (label: string, v: unknown) => (typeof v === 'string' && v.trim() ? `${label}: ${v.trim()}\n` : '')
  return `# ${String(j.title ?? '').trim()}\n\n${line('Company', j.company)}${line('Location', j.location)}${line('Salary', j.salary)}`
    + `${line('Employment type', j.employment_type)}${line('Posted', j.posted_at)}\n${typeof p.description === 'string' ? toText(p.description) : ''}`
}

/** The last `{"jobs": …}` object in an agent's output (balanced-brace scan, string-aware). */
export function extractJobsJson(output: string): unknown {
  for (let start = output.lastIndexOf('{"jobs"'); start >= 0; start = output.lastIndexOf('{"jobs"', start - 1)) {
    let depth = 0
    let inString = false
    for (let i = start; i < output.length; i++) {
      const c = output[i]
      if (inString) { if (c === '\\') i++; else if (c === '"') inString = false; continue }
      if (c === '"') inString = true
      else if (c === '{') depth++
      else if (c === '}' && --depth === 0) {
        try { return JSON.parse(output.slice(start, i + 1)) } catch { break }
      }
    }
    if (start === 0) break
  }
  return null
}

// ————— Hand-off to career-ops (local-parser provider → scan.mjs's own filters/dedup/writers) —————

/** Prints the jobs file it's given — the in-repo parser script local-parser requires. */
export const EMITTER_SCRIPT = `// Careerloom web boards: print the jobs JSON Careerloom already extracted (career-ops local-parser).
import { readFileSync } from 'node:fs'
process.stdout.write(readFileSync(process.argv[2], 'utf8'))
`

/** portals.yml cut to these boards, each wired to local-parser via `node <emitter> <jobsFile>`. */
export function webScanYaml(portalsText: string, boards: Array<{ name: string; jobsFile: string }>, emitter: string): string {
  const doc = parseDocument(subsetPortalsYaml(portalsText, boards.map(b => b.name)))
  const all = (doc.toJS() as { tracked_companies?: Array<Record<string, unknown>> }).tracked_companies ?? []
  doc.set('tracked_companies', all.map(c => {
    const board = boards.find(b => b.name === c.name)!
    const { fetch: _fetch, listing_urls: _urls, ...rest } = c
    return { ...rest, parser: { command: 'node', script: emitter, args: [board.jobsFile] } }
  }))
  return String(doc)
}

/** Which web board found each job URL (data/careerloom-web-boards.json): lets the Jobs
 *  screen file aggregator postings (many companies) under the board that surfaced them. */
export function mergeBoardIndex(index: Record<string, string>, board: string, jobs: WebJob[]): Record<string, string> {
  return { ...index, ...Object.fromEntries(jobs.map(j => [normUrl(j.url), board])) }
}

export function portalIdForUrl(index: Record<string, string>, url: string, sources: Source[]): string | null {
  const board = index[normUrl(url)]
  return board ? sources.find(s => s.name === board)?.id ?? null : null
}
