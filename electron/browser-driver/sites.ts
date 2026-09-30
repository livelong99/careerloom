// Per-site job-card extractors, run inside the page (they are serialised with toString, so each must be
// self-contained) and unit-tested against saved pages in jsdom. Prefer stable attributes (data-test,
// data-testid, aria-label) over the hashed class names these sites rotate. Results are raw: the caller
// always passes them through validateJobs.
export type RawJob = { title: string; company: string; location: string; url: string; salary?: string; posted_at?: string; description_snippet?: string }
type El = { querySelector(s: string): El | null; querySelectorAll(s: string): ArrayLike<El>; textContent: string | null; getAttribute(n: string): string | null }
export type Doc = { querySelector(s: string): El | null; querySelectorAll(s: string): ArrayLike<El> }

export type Site = {
  id: 'linkedin' | 'naukri' | 'indeed' | 'glassdoor'
  matches: (domain: string) => boolean
  extract: (doc: Doc) => RawJob[]
  /** Selector for result links: when it matches but the extractor read nothing, the extractor is stale. */
  resultLinks: string
  /** Page `index` (0-based) of the search at `url`, by URL so no control is ever clicked. */
  pageUrl: (url: string, index: number) => string
}

function linkedinExtract(doc: Doc): RawJob[] {
  const text = (e: El | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const out: RawJob[] = []
  const seen: Record<string, true> = {}
  const cards = doc.querySelectorAll('[data-occludable-job-id], [data-job-id]')
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!
    const id = card.getAttribute('data-occludable-job-id') || card.getAttribute('data-job-id') || ''
    const link = card.querySelector('a[href*="/jobs/view/"]')
    const title = (link?.getAttribute('aria-label') || text(link)).trim()
    if (!/^\d+$/.test(id) || !title || seen[id]) continue
    seen[id] = true
    out.push({
      title, company: text(card.querySelector('.artdeco-entity-lockup__subtitle')), location: text(card.querySelector('.artdeco-entity-lockup__caption')),
      url: 'https://www.linkedin.com/jobs/view/' + id + '/',
    })
  }
  return out
}

function naukriExtract(doc: Doc): RawJob[] {
  const text = (e: El | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const out: RawJob[] = []
  const cards = doc.querySelectorAll('.srp-jobtuple-wrapper, article.jobTuple')
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!
    const link = card.querySelector('a.title')
    const title = (link?.getAttribute('title') || text(link)).trim()
    const url = link?.getAttribute('href') || ''
    if (!title || !url) continue
    out.push({
      title, url, company: text(card.querySelector('a.comp-name, .comp-name')), location: text(card.querySelector('.loc-wrap .locWdth, .loc-wrap span')),
      salary: text(card.querySelector('.sal-wrap span')) || undefined, posted_at: text(card.querySelector('.job-post-day')) || undefined,
      description_snippet: text(card.querySelector('.job-desc')) || undefined,
    })
  }
  return out
}

function indeedExtract(doc: Doc): RawJob[] {
  const text = (e: El | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const origin = (doc.querySelector('link[rel="canonical"]')?.getAttribute('href') || '').match(/^https?:\/\/[^/]+/)?.[0] || 'https://www.indeed.com'
  const out: RawJob[] = []
  const seen: Record<string, true> = {}
  const cards = doc.querySelectorAll('.job_seen_beacon')
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!
    const link = card.querySelector('a[data-jk]')
    const jk = link?.getAttribute('data-jk') || ''
    const title = text(card.querySelector('h2.jobTitle span[title], h2.jobTitle, h3.jobTitle span[title], h3.jobTitle'))
    if (!/^[0-9a-f]+$/i.test(jk) || !title || seen[jk]) continue
    seen[jk] = true
    out.push({
      title, url: origin + '/viewjob?jk=' + jk, company: text(card.querySelector('[data-testid="company-name"]')), location: text(card.querySelector('[data-testid="text-location"]')),
      salary: text(card.querySelector('[data-testid="attribute_snippet_testid"], .salary-snippet-container')) || undefined,
      description_snippet: text(card.querySelector('.job-snippet, [data-testid="jobsnippet_footer"]')) || undefined,
    })
  }
  return out
}

function glassdoorExtract(doc: Doc): RawJob[] {
  const text = (e: El | null) => (e?.textContent ?? '').replace(/\s+/g, ' ').trim()
  const out: RawJob[] = []
  const cards = doc.querySelectorAll('li[data-test="jobListing"]')
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i]!
    const link = card.querySelector('a[data-test="job-title"]')
    const title = text(link)
    const url = link?.getAttribute('href') || ''
    if (!title || !url) continue
    out.push({
      title, url, company: text(card.querySelector('[class*="EmployerProfile_compactEmployerName"], [class*="EmployerProfile_employerName"]')),
      location: text(card.querySelector('[data-test="emp-location"]')), salary: text(card.querySelector('[data-test="detailSalary"]')) || undefined,
      description_snippet: text(card.querySelector('[data-test="descSnippet"]')) || undefined,
    })
  }
  return out
}

function withParam(url: string, key: string, value: string | null, drop: string[] = []): string {
  const u = new URL(url)
  for (const k of drop) u.searchParams.delete(k)
  if (value === null) u.searchParams.delete(key)
  else u.searchParams.set(key, value)
  return u.toString()
}

export const SITES: Site[] = [
  {
    id: 'linkedin', matches: d => d === 'linkedin.com', extract: linkedinExtract, resultLinks: 'a[href*="/jobs/view/"]',
    pageUrl: (url, i) => withParam(url, 'start', i ? String(i * 25) : null, ['currentJobId']),
  },
  {
    // Naukri pages are /<slug> then /<slug>-2, /<slug>-3
    id: 'naukri', matches: d => d === 'naukri.com', extract: naukriExtract, resultLinks: 'a[href*="/job-listings-"]',
    pageUrl: (url, i) => {
      const u = new URL(url)
      u.pathname = u.pathname.replace(/-\d+$/, '') + (i ? `-${i + 1}` : '')
      return u.toString()
    },
  },
  {
    id: 'indeed', matches: d => /^indeed\./.test(d), extract: indeedExtract, resultLinks: 'a[data-jk]',
    pageUrl: (url, i) => withParam(url, 'start', i ? String(i * 10) : null, ['vjk']),
  },
  {
    // Glassdoor pages are …-SRCH_….htm then …_IP2.htm, …_IP3.htm
    id: 'glassdoor', matches: d => /^glassdoor\./.test(d), extract: glassdoorExtract, resultLinks: 'a[href*="/job-listing/"]',
    pageUrl: (url, i) => {
      const u = new URL(url)
      u.pathname = u.pathname.replace(/(_IP\d+)?\.htm$/, i ? `_IP${i + 1}.htm` : '.htm')
      return u.toString()
    },
  },
]

export const siteFor = (domain: string): Site | undefined => SITES.find(s => s.matches(domain))

export const hasResults = (selector: string): string => `document.querySelectorAll(${JSON.stringify(selector)}).length > 0`

/** Expression for Runtime.evaluate: runs a self-contained function against the page's document. */
export const scriptOf = (fn: (doc: Doc) => unknown): string => `(${fn.toString()})(document)`

/** A login / captcha / bot-check wall, as a short reason, else null. A "sign in" prompt alone isn't a wall
 *  when result links are still on the page (public search pages show one above the results). */
export function wallReason(doc: Doc & { title?: string; body?: { textContent: string | null } | null }, href: string, hasResults: boolean): string | null {
  let path = ''
  try { path = new URL(href).pathname.toLowerCase() } catch { /* about:blank */ }
  if (/(\/authwall|\/checkpoint|\/uas\/login|\/login\b|\/signin|\/captcha|\/challenge|\/security-check)/.test(path)) return `redirected to ${path.slice(0, 40)}`
  const title = (doc.title ?? '').toLowerCase()
  if (/(captcha|just a moment|access denied|security check|verify you are human|attention required|are you a robot)/.test(title)) return `page says "${(doc.title ?? '').slice(0, 50)}"`
  if (hasResults) return null
  const body = (doc.body?.textContent ?? '').replace(/\s+/g, ' ').slice(0, 3000).toLowerCase()
  const m = body.match(/(verify you are human|unusual (traffic|activity)|are you a robot|press and hold|sign in to (continue|view)|log in to (continue|view)|join now to see)/)
  return m ? `page says "${m[0]}"` : null
}
