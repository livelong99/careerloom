// @vitest-environment jsdom
import fs from 'node:fs'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { validateJobs } from '../integrations/web-board-core'
import { genericExtract } from './generic'
import { SITES, hasResults, scriptOf, siteFor, wallReason, type Doc } from './sites'

// Fixtures are the first six result cards of real public search pages (LinkedIn, Naukri, Indeed,
// Glassdoor), stripped to structure and text: no images, scripts, tracking parameters or personal data.
const parse = (html: string) => new DOMParser().parseFromString(html, 'text/html')
const text = (name: string) => fs.readFileSync(path.join(__dirname, 'fixtures', `${name}.html`), 'utf8')
const load = (name: string) => parse(text(name)) as unknown as Doc

describe.each(SITES)('$id extractor', site => {
  const doc = load(site.id)
  it('reads the six cards into valid jobs', () => {
    const raw = site.extract(doc)
    expect(raw).toHaveLength(6)
    for (const j of raw) { expect(j.title).toBeTruthy(); expect(j.company).toBeTruthy(); expect(j.location).toBeTruthy() }
    const jobs = validateJobs(raw, 'https://' + site.id + '.test/')
    expect(jobs).toHaveLength(6)
    expect(new Set(jobs.map(j => j.url)).size).toBe(6)
  })
  it('titles carry no site badge text', () => expect(site.extract(doc).some(j => / with verification$/.test(j.title))).toBe(false))
  it('recognises a results page', () => expect(new Function('document', `return ${hasResults(site.resultLinks)}`)(parse(text(site.id)))).toBe(true))
  it('survives serialisation into the page (toString has no outside references)', () => {
    const run = new Function('document', `return ${scriptOf(site.extract)}`)
    expect(run(parse(text(site.id)))).toEqual(site.extract(doc))
  })
})

describe('generic extractor (no site knowledge)', () => {
  it.each(SITES.map(s => s.id))('finds the repeating job cards on %s', id => {
    const raw = genericExtract(load(id) as never)
    expect(raw.length).toBeGreaterThanOrEqual(5)
    expect(raw.every(j => j.title && j.url)).toBe(true)
    expect(validateJobs(raw, 'https://' + id + '.test/').length).toBeGreaterThanOrEqual(5)
  })
  it('returns nothing for a page with no repeated job links', () => {
    const doc = parse('<body><a href="/jobs/1">Only one job link here</a><p>hi</p></body>')
    expect(genericExtract(doc as never)).toEqual([])
  })
})

describe('site urls and pagination', () => {
  const nth = (id: string, url: string, n: number) => SITES.find(s => s.id === id)!.pageUrl(url, n)
  it('linkedin uses start=25n and drops currentJobId', () => {
    expect(nth('linkedin', 'https://www.linkedin.com/jobs/search/?keywords=x&currentJobId=9', 0)).toBe('https://www.linkedin.com/jobs/search/?keywords=x')
    expect(nth('linkedin', 'https://www.linkedin.com/jobs/search/?keywords=x', 2)).toBe('https://www.linkedin.com/jobs/search/?keywords=x&start=50')
  })
  it('naukri appends -n to the slug', () => {
    expect(nth('naukri', 'https://www.naukri.com/backend-developer-jobs-in-india?k=a', 1)).toBe('https://www.naukri.com/backend-developer-jobs-in-india-2?k=a')
    expect(nth('naukri', 'https://www.naukri.com/backend-developer-jobs-in-india-2', 2)).toBe('https://www.naukri.com/backend-developer-jobs-in-india-3')
  })
  it('indeed uses start=10n', () => expect(nth('indeed', 'https://in.indeed.com/jobs?q=a&vjk=z', 2)).toBe('https://in.indeed.com/jobs?q=a&start=20'))
  it('glassdoor inserts _IPn before .htm', () => {
    const u = 'https://www.glassdoor.co.in/Job/india-backend-engineer-jobs-SRCH_IL.0,5_IN115_KO6,22.htm'
    expect(nth('glassdoor', u, 1)).toBe('https://www.glassdoor.co.in/Job/india-backend-engineer-jobs-SRCH_IL.0,5_IN115_KO6,22_IP2.htm')
    expect(nth('glassdoor', u.replace('.htm', '_IP2.htm'), 2)).toContain('_IP3.htm')
  })
  it('matches boards by registrable domain', () => {
    expect(siteFor('glassdoor.co.in')?.id).toBe('glassdoor')
    expect(siteFor('indeed.com')?.id).toBe('indeed')
    expect(siteFor('example.com')).toBeUndefined()
  })
})

describe('wallReason', () => {
  const page = (html: string) => parse(html) as never
  it('flags auth redirects and captcha titles', () => {
    expect(wallReason(page('<body>x</body>'), 'https://www.linkedin.com/authwall?x=1', false)).toMatch(/authwall/)
    expect(wallReason(page('<title>Just a moment...</title>'), 'https://x.com/jobs', true)).toMatch(/Just a moment/)
  })
  it('flags a sign-in prompt only when there are no results', () => {
    const p = page('<body>Sign in to continue to see jobs</body>')
    expect(wallReason(p, 'https://x.com/jobs', false)).toMatch(/sign in/)
    expect(wallReason(p, 'https://x.com/jobs', true)).toBeNull()
  })
})
