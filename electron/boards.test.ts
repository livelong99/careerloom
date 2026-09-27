import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'

import { portalDetail, validatePortalPatch } from './integrations/portal-edit'
import { readAllSources, updateSources } from './integrations/sources'
import { latestHealth, logTail, mergeScanHistory, parseScanRuns } from './scan-history'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-boards-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

const YAML = `# portals
tracked_companies:
  # ATS
  - name: GitLab
    careers_url: https://job-boards.greenhouse.io/gitlab
    provider: greenhouse
    enabled: true
  - name: Remote Board
    careers_url: https://rb.io/jobs
    enabled: true
    fetch: firecrawl
job_boards:
  - name: SolidJobs IT
    careers_url: https://solid.jobs/public-api/offers/it
    provider: solidjobs
    enabled: false
`

describe('board editor', () => {
  const file = path.join(dir, 'portals.yml')
  fs.writeFileSync(file, YAML)
  const all = readAllSources(file)
  const [gitlab, web, solid] = all as [typeof all[0], typeof all[0], typeof all[0]]

  it('validates edits strictly', () => {
    expect(validatePortalPatch({ name: '  Git   Lab ', enabled: false }, gitlab, all.slice(1))).toEqual({ name: 'Git Lab', enabled: false })
    expect(() => validatePortalPatch({ name: 'remote board' }, gitlab, all.slice(1))).toThrow(/already exists/)
    expect(() => validatePortalPatch({ name: '-x' }, gitlab, [])).toThrow(/Name/)
    expect(() => validatePortalPatch({ name: 'a|b' }, gitlab, [])).toThrow(/Name/)
    expect(() => validatePortalPatch({ urls: ['http://127.0.0.1/admin'] }, web, [])).toThrow(/Private/)
    expect(() => validatePortalPatch({ urls: [] }, web, [])).toThrow(/1–5/)
    expect(() => validatePortalPatch({ urls: Array(6).fill('https://a.io') }, web, [])).toThrow(/1–5/)
    expect(validatePortalPatch({ urls: ['https://rb.io/jobs', ' https://rb.io/jobs ', 'https://rb.io/jobs?page=2'] }, web, [])).toEqual({ urls: ['https://rb.io/jobs', 'https://rb.io/jobs?page=2'] })
    expect(() => validatePortalPatch({ fetch: 'browser' }, gitlab, [])).toThrow(/Only web boards/)
    expect(validatePortalPatch({ fetch: 'browser' }, web, [])).toEqual({ fetch: 'browser' })
    expect(() => validatePortalPatch({ provider: 'Bad Id!' }, gitlab, [])).toThrow(/Provider/)
    expect(validatePortalPatch({ provider: null, api: '' }, gitlab, [])).toEqual({ provider: null, api: null })
    expect(() => validatePortalPatch({ enabled: 'yes' }, gitlab, [])).toThrow(/enabled/)
    expect(() => validatePortalPatch(null, gitlab, [])).toThrow()
  })

  it('writes edits in place, keeping comments and other keys', () => {
    updateSources(file, [
      [gitlab, { name: 'GitLab Inc', enabled: false }],
      [web, { urls: ['https://rb.io/jobs', 'https://rb.io/jobs?page=2'], fetch: 'browser' }],
      [solid, { enabled: true, provider: null }],
    ])
    const text = fs.readFileSync(file, 'utf8')
    expect(text).toContain('# portals')
    expect(text).toContain('# ATS')
    const next = readAllSources(file)
    expect(next[0]).toMatchObject({ name: 'GitLab Inc', enabled: false, provider: 'greenhouse', careers_url: 'https://job-boards.greenhouse.io/gitlab' })
    expect(next[1]).toMatchObject({ fetch: 'browser', careers_url: 'https://rb.io/jobs', listing_urls: ['https://rb.io/jobs', 'https://rb.io/jobs?page=2'] })
    expect(next[2]).toMatchObject({ name: 'SolidJobs IT', enabled: true, list: 'job_boards' })
    expect(next[2]!.provider).toBeUndefined()
    updateSources(file, [[next[1]!, { urls: ['https://rb.io/all'] }]])
    expect(readAllSources(file)[1]!.listing_urls).toBeUndefined()
    expect(portalDetail(readAllSources(file)[1]!, 'only remote')).toMatchObject({ urls: ['https://rb.io/all'], fetch: 'browser', guideline: 'only remote', list: 'tracked_companies' })
    expect(() => updateSources(file, [[{ ...gitlab, name: 'Gone' }, { enabled: true }]])).toThrow(/no longer/)
  })
})

describe('scan history', () => {
  const TSV = 'timestamp\tstatus\tcompanies\tboards\tfound\tfiltered_title\tdupes\tnew_added\terrors\n'
    + '2026-09-27T10:00:30.000Z\tcompleted\t3\t1\t40\t0\t5\t35\t0\n'
    + '2026-09-27T12:00:00.000Z\tcompleted\t1\t0\t10\t0\t10\t0\t0\n'
    + 'garbage line\n'
  it('parses scan-runs.tsv by header name', () => {
    expect(parseScanRuns(TSV)).toEqual([
      { at: Date.parse('2026-09-27T10:00:30.000Z'), status: 'completed', companies: 3, boards: 1, found: 40, dupes: 5, added: 35, errors: 0 },
      { at: Date.parse('2026-09-27T12:00:00.000Z'), status: 'completed', companies: 1, boards: 0, found: 10, dupes: 10, added: 0, errors: 0 },
    ])
    expect(parseScanRuns('')).toEqual([])
  })
  it('merges runs with the tsv rows stamped during them; unclaimed rows are external scans; newest first', () => {
    const start = Date.parse('2026-09-27T10:00:00.000Z')
    const merged = mergeScanHistory(parseScanRuns(TSV), [
      { id: 'r1', mode: 'scan', label: 'Scan all portals', input: null, startedAt: start, endedAt: start + 25_000, status: 'done' },
      { id: 'r2', mode: 'evaluate', label: 'Evaluate x', input: null, startedAt: start, endedAt: start + 1, status: 'done' },
      { id: 'r3', mode: 'scan', label: 'Scan LinkedIn (web)', input: 'LinkedIn', startedAt: start + 3_600_000 * 3, endedAt: null, status: 'running' },
    ], start + 3_600_000 * 3 + 5_000)
    expect(merged.map(m => m.id)).toEqual(['r3', 'tsv:' + Date.parse('2026-09-27T12:00:00.000Z'), 'r1'])
    expect(merged[2]).toMatchObject({ runId: 'r1', source: 'careerloom', found: 40, added: 35, dupes: 5, errors: 0, durationMs: 25_000, status: 'done' })
    expect(merged[1]).toMatchObject({ runId: null, source: 'career-ops', found: 10, added: 0, boards: '1 companies' })
    expect(merged[0]).toMatchObject({ status: 'running', found: null, durationMs: null })
  })
  it('keeps the latest portal-health status per portal', () => {
    const health = latestHealth('timestamp\tcompany\tstatus\n2026-09-27T01:00:00Z\tgitlab\tunreachable\n2026-09-27T02:00:00Z\tgitlab\treachable\n2026-09-26T00:00:00Z\tacme\tempty\n')
    expect(health.get('gitlab')).toEqual({ status: 'reachable', at: '2026-09-27T02:00:00Z' })
    expect(health.get('acme')?.status).toBe('empty')
  })
})

describe('saved scan log tail', () => {
  it('keeps the last 200 lines and drops credential-looking lines', () => {
    const log = [...Array.from({ length: 250 }, (_, i) => `line ${i}`), 'Cookie: li_at=SECRET', 'Authorization: Bearer abc', 'api_key=xyz', 'done'].join('\n')
    const tail = logTail(log).split('\n')
    expect(tail).toHaveLength(200)
    expect(tail.at(-1)).toBe('done')
    expect(tail.join('\n')).not.toMatch(/SECRET|Bearer|xyz/)
  })
})
