// Allow-list tiers, the never-fetch list (a code constant, not a setting), licence tags, attribution (plan §9, research B1).
// `asOf` 2026-10-01: re-verify the licence strings and host tiers at release.
import type { ResearchSourceGroup, SourceKind } from './types'

export type SourceClass = { allowed: boolean; kind: SourceKind; trust: 0 | 1 | 2; licence: string | null; group: ResearchSourceGroup | null; reason?: string }

/** Registrable names that are never fetched (subdomains included); user toggles can only disable more, never enable these. */
export const NEVER_FETCH: readonly string[] = ['linkedin.com', 'teamblind.com', 'leetcode.com', 'reddit.com', 'medium.com']
/** Brand names denied on every TLD and subdomain (indeed.com, in.indeed.com, indeed.co.in …). */
const NEVER_FETCH_BRANDS: readonly string[] = ['indeed', 'glassdoor']

const bare = (host: string): string => host.toLowerCase().replace(/^\[|\]$/g, '').replace(/\.$/, '')
const under = (host: string, domain: string): boolean => host === domain || host.endsWith(`.${domain}`)

export function isNeverFetch(host: string): boolean {
  const h = bare(host)
  return NEVER_FETCH.some(d => under(h, d)) || h.split('.').some(label => NEVER_FETCH_BRANDS.includes(label))
}

type Rule = { match: (h: string) => boolean; kind: SourceKind; trust: 0 | 1 | 2; licence: string | null; group: ResearchSourceGroup }
const RULES: readonly Rule[] = [
  { match: h => under(h, 'stackoverflow.com') || under(h, 'stackexchange.com'), kind: 'qa-site', trust: 1, licence: 'CC BY-SA 4.0', group: 'stackexchange' },
  { match: h => under(h, 'github.com') || h === 'raw.githubusercontent.com', kind: 'github', trust: 1, licence: null, group: 'github' },
  { match: h => under(h, 'onetonline.org') || under(h, 'onetcenter.org'), kind: 'official-doc', trust: 2, licence: 'CC BY 4.0', group: 'taxonomy' },
  { match: h => under(h, 'wikipedia.org'), kind: 'official-doc', trust: 1, licence: 'CC BY-SA 4.0', group: 'taxonomy' },
  { match: h => under(h, 'wikidata.org'), kind: 'official-doc', trust: 1, licence: 'CC0 1.0', group: 'taxonomy' },
  { match: h => h === 'news.ycombinator.com', kind: 'forum', trust: 0, licence: null, group: 'hn' },
  { match: h => ['learn.microsoft.com', 'docs.aws.amazon.com', 'cloud.google.com', 'kubernetes.io', 'developer.mozilla.org'].some(d => under(h, d)), kind: 'official-doc', trust: 2, licence: null, group: 'articles' },
  { match: h => under(h, 'dev.to'), kind: 'eng-blog', trust: 0, licence: null, group: 'articles' },
]

const slug = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, '')

/** `company` lets a host that carries the employer's name count as a company page. Unknown hosts are fetchable (robots permitting) but low trust. */
export function classifyHost(url: string, company?: string): SourceClass {
  let host: string
  try { host = bare(new URL(url).hostname) } catch { return { allowed: false, kind: 'other', trust: 0, licence: null, group: null, reason: 'not a URL' } }
  if (isNeverFetch(host)) return { allowed: false, kind: 'other', trust: 0, licence: null, group: null, reason: 'never-fetch host' }
  const rule = RULES.find(r => r.match(host))
  if (rule) return { allowed: true, kind: rule.kind, trust: rule.trust, licence: rule.licence, group: rule.group }
  const c = company ? slug(company) : ''
  if (c.length >= 3 && slug(host).includes(c)) return { allowed: true, kind: 'company-page', trust: 1, licence: null, group: 'companyPages' }
  if (/(^|\.)(engineering|eng|tech|blog)\./.test(host) || /(^|\.)(engineering|eng|tech)[a-z0-9-]*\.[a-z]+$/.test(host)) return { allowed: true, kind: 'eng-blog', trust: 1, licence: null, group: 'articles' }
  return { allowed: true, kind: 'other', trust: 0, licence: null, group: 'articles' }
}

/** Visible attribution for the item sheet; empty when the licence asks for none. */
export function attribution(licence: string | null, title: string, url: string): string {
  const t = title.replace(/\s+/g, ' ').trim().slice(0, 120) || url
  if (licence === 'CC BY-SA 4.0') return `Adapted from “${t}” (${url}), licensed CC BY-SA 4.0. Our summary is a changed version.`
  if (licence === 'CC BY 4.0') return `Based on “${t}” (${url}), licensed CC BY 4.0. Changes were made.`
  if (licence === 'CC0 1.0') return `From “${t}” (${url}), CC0 1.0.`
  return `Summarised from “${t}” (${url}).`
}
