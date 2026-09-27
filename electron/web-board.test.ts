import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse as parseYaml } from 'yaml'

import { addTrackedCompany, readTrackedCompanies, withSourceIds } from './integrations/sources'
import {
  boardUrls, extractJobsJson, isWebBoard, jsonLdJobs, MAX_JOBS, mergeBoardIndex, nextPageUrl, pageLinks, portalIdForUrl, robotsAllows,
  validateJobs, webScanYaml,
} from './integrations/web-board-core'

const PAGE = 'https://jobs.example.com/search?q=backend'

describe('robotsAllows', () => {
  const robots = `
User-agent: *
Disallow: /search
Allow: /search/public
Disallow: /*.pdf$

User-agent: CareerLoom
User-agent: other
Disallow: /private
`
  it('uses our own group over *', () => {
    expect(robotsAllows(robots, 'https://x.io/search?q=1')).toBe(true)
    expect(robotsAllows(robots, 'https://x.io/private/a')).toBe(false)
  })
  it('falls back to *, longest match wins, $ anchors', () => {
    expect(robotsAllows(robots, 'https://x.io/search?q=1', 'somebot')).toBe(false)
    expect(robotsAllows(robots, 'https://x.io/search/public/1', 'somebot')).toBe(true)
    expect(robotsAllows(robots, 'https://x.io/a/b.pdf', 'somebot')).toBe(false)
    expect(robotsAllows(robots, 'https://x.io/a/b.pdf?x', 'somebot')).toBe(true)
  })
  it('allows everything with no rules or an empty Disallow', () => {
    expect(robotsAllows('', 'https://x.io/jobs')).toBe(true)
    expect(robotsAllows('User-agent: *\nDisallow:\n', 'https://x.io/jobs')).toBe(true)
  })
})

describe('jsonLdJobs', () => {
  const html = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[
  {"@type":"JobPosting","title":"Backend Engineer","url":"/jobs/1","hiringOrganization":{"@type":"Organization","name":"Acme"},
   "jobLocation":{"@type":"Place","address":{"addressLocality":"Bengaluru","addressCountry":"IN"}},"datePosted":"2026-09-20",
   "employmentType":["FULL_TIME"],"baseSalary":{"currency":"INR","value":{"minValue":2000000,"maxValue":3000000,"unitText":"YEAR"}},
   "description":"<p>Build <b>APIs</b></p>"},
  {"@type":"Organization","name":"not a job"}]}</script>
<script type='application/ld+json'>[{"@type":["JobPosting"],"name":"SRE","sameAs":"https://other.io/sre","jobLocationType":"TELECOMMUTE"}]</script>
<script type="application/ld+json">{ broken json </script>
</head></html>`
  it('maps JobPosting fields, resolves relative URLs, skips junk and broken blocks', () => {
    const jobs = jsonLdJobs(html, PAGE)
    expect(jobs).toHaveLength(2)
    expect(jobs[0]).toMatchObject({
      title: 'Backend Engineer', url: 'https://jobs.example.com/jobs/1', company: 'Acme', location: 'Bengaluru, IN',
      posted_at: '2026-09-20', employment_type: 'FULL_TIME', salary: 'INR 2000000–3000000 YEAR', description_snippet: 'Build APIs',
    })
    expect(jobs[1]).toMatchObject({ title: 'SRE', url: 'https://other.io/sre', remote: true, location: 'Remote' })
  })
  it('returns [] for a page without JSON-LD', () => {
    expect(jsonLdJobs('<html><body>jobs</body></html>', PAGE)).toEqual([])
  })
})

describe('validateJobs (agent JSON)', () => {
  it('resolves relative URLs, trims, and drops junk, dupes and non-http links', () => {
    const jobs = validateJobs({
      jobs: [
        { title: '  Staff   Engineer ', url: '/jobs/9#apply', company: ' Beta ', remote: 'yes' },
        { title: 'Dupe', url: 'https://jobs.example.com/jobs/9' },
        { title: '', url: '/jobs/10' },
        { title: 'No url' },
        { title: 'Script', url: 'javascript:alert(1)' },
        { title: 'Local', url: 'http://127.0.0.1/admin' },
        { title: 'Creds', url: 'https://u:p@x.io/j' },
        'junk', null, 42,
      ],
    }, PAGE)
    expect(jobs).toEqual([{
      title: 'Staff Engineer', url: 'https://jobs.example.com/jobs/9', company: 'Beta', location: '', posted_at: null,
      salary: null, employment_type: null, remote: null, description_snippet: '',
    }])
  })
  it('caps at MAX_JOBS and rejects non-list payloads', () => {
    const many = Array.from({ length: MAX_JOBS + 50 }, (_, i) => ({ title: `Job ${i}`, url: `/j/${i}` }))
    expect(validateJobs({ jobs: many }, PAGE)).toHaveLength(MAX_JOBS)
    expect(validateJobs({ jobs: 'nope' }, PAGE)).toEqual([])
    expect(validateJobs(null, PAGE)).toEqual([])
  })
  it('drops URLs the page never linked when the link set is known', () => {
    const known = pageLinks({ url: PAGE, markdown: '[Backend](https://jobs.example.com/jobs/1) [x](/jobs/2 "t")' })
    const jobs = validateJobs([{ title: 'Real', url: '/jobs/2' }, { title: 'Invented', url: '/jobs/3' }, { title: 'Real 1', url: 'https://jobs.example.com/jobs/1/' }], PAGE, known)
    expect(jobs.map(j => j.title)).toEqual(['Real', 'Real 1'])
  })
})

describe('extractJobsJson', () => {
  it('finds the last {"jobs": …} object in agent output, braces inside strings included', () => {
    const log = 'thinking {"jobs":[]}\nDone:\n{"jobs":[{"title":"A {weird} \\"one\\"","url":"https://x.io/a"}]}\ntrailing'
    expect(extractJobsJson(log)).toEqual({ jobs: [{ title: 'A {weird} "one"', url: 'https://x.io/a' }] })
    expect(extractJobsJson('no json here')).toBeNull()
  })
})

describe('nextPageUrl', () => {
  it('prefers rel=next, then a Next link, same origin only, not visited', () => {
    const visited = new Set<string>()
    expect(nextPageUrl({ url: PAGE, markdown: '', rawHtml: '<link rel="next" href="/search?q=backend&amp;page=2">' }, visited)).toBe('https://jobs.example.com/search?q=backend&page=2')
    expect(nextPageUrl({ url: PAGE, markdown: '[1](/p1) [Next ›](/search?page=2)' }, visited)).toBe('https://jobs.example.com/search?page=2')
    expect(nextPageUrl({ url: PAGE, markdown: '[Next](https://evil.io/page2)' }, visited)).toBeNull()
    expect(nextPageUrl({ url: PAGE, markdown: '[Next](/search?page=2)' }, new Set(['https://jobs.example.com/search?page=2']))).toBeNull()
  })
})

describe('web-board config round-trip', () => {
  it('persists fetch/listing_urls in portals.yml and wires local-parser for the scan', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-web-'))
    const file = path.join(dir, 'portals.yml')
    fs.writeFileSync(file, '# my portals\ntitle_filter:\n  positive: [backend]\ntracked_companies:\n  - name: Acme\n    careers_url: https://job-boards.greenhouse.io/acme\n')
    addTrackedCompany(file, { name: 'Remote Board', careers_url: 'https://rb.io/jobs', enabled: true, fetch: 'firecrawl', listing_urls: ['https://rb.io/jobs', 'https://rb.io/jobs?page=2'] })
    const [acme, board] = withSourceIds(readTrackedCompanies(file))
    expect(isWebBoard(acme!)).toBe(false)
    expect(isWebBoard(board!)).toBe(true)
    expect(boardUrls(board!)).toEqual(['https://rb.io/jobs', 'https://rb.io/jobs?page=2'])
    expect(fs.readFileSync(file, 'utf8')).toContain('# my portals')

    const yaml = parseYaml(webScanYaml(fs.readFileSync(file, 'utf8'), [{ name: 'Remote Board', jobsFile: 'batch/careerloom/w.jobs.json' }], 'batch/careerloom/web-emit.mjs'))
    expect(yaml.title_filter).toEqual({ positive: ['backend'] })
    expect(yaml.tracked_companies).toEqual([{
      name: 'Remote Board', careers_url: 'https://rb.io/jobs', enabled: true,
      parser: { command: 'node', script: 'batch/careerloom/web-emit.mjs', args: ['batch/careerloom/w.jobs.json'] },
    }])

    const index = mergeBoardIndex({}, 'Remote Board', validateJobs([{ title: 'X', url: 'https://other.io/x/' }], PAGE))
    expect(portalIdForUrl(index, 'https://other.io/x', [acme!, board!])).toBe(board!.id)
    expect(portalIdForUrl(index, 'https://nowhere.io', [acme!, board!])).toBeNull()
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
