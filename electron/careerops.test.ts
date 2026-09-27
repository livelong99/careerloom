import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, it, expect, beforeEach } from 'vitest'
import { checkRoot, readTracker, readPipeline, listReports, readReport, statusCounts } from './careerops'

let root: string

beforeEach(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'careerops-'))
  fs.writeFileSync(path.join(root, 'AGENTS.md'), '# agent instructions')
  fs.mkdirSync(path.join(root, 'modes'))
  fs.mkdirSync(path.join(root, 'data'), { recursive: true })
})

describe('checkRoot', () => {
  it('ok when AGENTS.md and modes/ exist, dataRoot defaults to root', () => {
    expect(checkRoot(root)).toEqual({ ok: true, root, dataRoot: root })
  })

  it('fails without AGENTS.md', () => {
    const bad = fs.mkdtempSync(path.join(os.tmpdir(), 'careerops-bad-'))
    fs.mkdirSync(path.join(bad, 'modes'))
    expect(checkRoot(bad).ok).toBe(false)
  })

  it('resolves dataRoot from the .career-ops-data marker file', () => {
    const external = fs.mkdtempSync(path.join(os.tmpdir(), 'careerops-data-'))
    fs.writeFileSync(path.join(root, '.career-ops-data'), external)
    const result = checkRoot(root)
    expect(result.ok).toBe(true)
    expect(result.ok && result.dataRoot).toBe(external)
  })
})

describe('readTracker', () => {
  it('parses the 9-column (no Via) layout, mapping by header name', () => {
    const md = [
      '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
      '|---|------|---------|------|-------|--------|-----|--------|-------|',
      '| 1 | 2026-06-20 | Acme | Senior Platform Engineer | 4.2/5 | Applied | ✅ | [1](../reports/001-acme-2026-06-20.md) | Strong fit |',
      '| 3 | 2026-06-26 | Initech | SRE | 3.1/5 | SKIP | ❌ | — | Below bar |',
    ].join('\n')
    fs.writeFileSync(path.join(root, 'data', 'applications.md'), md)
    const apps = readTracker(root)
    expect(apps).toHaveLength(2)
    expect(apps[0]).toEqual({
      num: 1, date: '2026-06-20', company: 'Acme', via: null, role: 'Senior Platform Engineer',
      score: 4.2, status: 'Applied', pdf: true, report: 'reports/001-acme-2026-06-20.md', notes: 'Strong fit',
    })
    expect(apps[1].score).toBe(3.1)
    expect(apps[1].pdf).toBe(false)
    expect(apps[1].report).toBeNull()
    // The re-based link must pass readReport's traversal guard.
    fs.mkdirSync(path.join(root, 'reports'), { recursive: true })
    fs.writeFileSync(path.join(root, 'reports', '001-acme-2026-06-20.md'), '# Acme')
    expect(readReport(root, apps[0].report!)).toBe('# Acme')
  })

  it('parses the 10-column (with Via) layout', () => {
    const md = [
      '| # | Date | Company | Via | Role | Score | Status | PDF | Report | Notes |',
      '|---|------|---------|-----|------|-------|--------|-----|--------|-------|',
      '| 2 | 2026-06-25 | Globex | Hays | Staff DevOps Engineer | 4.5/5 | Interview | ✅ | [2](../reports/002-globex-2026-06-25.md) | Referral |',
      '| 3 | 2026-06-26 | Initech | — | SRE | 3.1/5 | SKIP | ❌ | — | Below bar |',
    ].join('\n')
    fs.writeFileSync(path.join(root, 'data', 'applications.md'), md)
    const apps = readTracker(root)
    expect(apps[0].via).toBe('Hays')
    expect(apps[1].via).toBeNull() // em-dash sentinel -> null
  })

  it('parses N/A and hyphen score sentinels as null', () => {
    const md = [
      '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |',
      '|---|------|---------|------|-------|--------|-----|--------|-------|',
      '| 1 | 2026-01-01 | X | Y | N/A | Evaluated | ❌ | - | |',
    ].join('\n')
    fs.writeFileSync(path.join(root, 'data', 'applications.md'), md)
    expect(readTracker(root)[0].score).toBeNull()
  })

  it('falls back to applications.md when data/applications.md is missing', () => {
    fs.rmSync(path.join(root, 'data'), { recursive: true, force: true })
    fs.writeFileSync(
      path.join(root, 'applications.md'),
      '| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|---|---|---|---|---|---|---|---|\n| 1 | d | c | r | 4/5 | Applied | yes | - | n |',
    )
    expect(readTracker(root)).toHaveLength(1)
  })

  it('returns [] when no tracker file exists', () => {
    expect(readTracker(root)).toEqual([])
  })
})

describe('readPipeline', () => {
  it('parses pending and processed rows of varying width', () => {
    const md = [
      '## Pending',
      '- [ ] https://jobs.example.com/posting/123',
      '- [ ] https://boards.greenhouse.io/company/jobs/456 | Company Inc | Senior PM',
      '- [ ] https://jobs.ashbyhq.com/acme/792 | Acme Corp | Backend Engineer | posted: 2026-06-18',
      '## Processed',
      '- [x] #143 | https://jobs.example.com/posting/789 | Acme Corp | AI PM | 4.2/5 | PDF ✅',
    ].join('\n')
    fs.writeFileSync(path.join(root, 'data', 'pipeline.md'), md)
    const items = readPipeline(root)
    expect(items).toHaveLength(4)
    expect(items[0]).toMatchObject({ url: 'https://jobs.example.com/posting/123', company: null, role: null, done: false })
    expect(items[1]).toMatchObject({ url: 'https://boards.greenhouse.io/company/jobs/456', company: 'Company Inc', role: 'Senior PM', done: false })
    expect(items[2]).toMatchObject({ company: 'Acme Corp', role: 'Backend Engineer' }) // labeled "posted:" segment skipped
    expect(items[3]).toMatchObject({ url: 'https://jobs.example.com/posting/789', company: 'Acme Corp', role: 'AI PM', done: true })
  })

  it('returns [] when pipeline.md is missing', () => {
    expect(readPipeline(root)).toEqual([])
  })
})

describe('listReports', () => {
  it('parses header fields and sorts newest first', () => {
    fs.mkdirSync(path.join(root, 'reports'))
    fs.writeFileSync(
      path.join(root, 'reports', '001-acme-2026-04-01.md'),
      '# Evaluation: Acme AI -- Senior AI Engineer\n\n**Date:** 2026-04-01\n**Score:** 4.2/5\n**URL:** https://jobs.example.com/acme\n',
    )
    fs.writeFileSync(
      path.join(root, 'reports', '002-globex-2026-06-25.md'),
      '# Evaluation: Globex -- Staff DevOps\n\n**Date:** 2026-06-25\n**Score:** 4.5/5\n**URL:** https://jobs.example.com/globex\n',
    )
    const reports = listReports(root)
    expect(reports).toHaveLength(2)
    expect(reports[0].file).toBe('002-globex-2026-06-25.md') // newest (highest number) first
    expect(reports[0]).toMatchObject({ title: 'Evaluation: Globex -- Staff DevOps', date: '2026-06-25', score: 4.5, url: 'https://jobs.example.com/globex' })
  })

  it('returns [] when reports/ is missing', () => {
    expect(listReports(root)).toEqual([])
  })
})

describe('readReport', () => {
  beforeEach(() => {
    fs.mkdirSync(path.join(root, 'reports'))
    fs.writeFileSync(path.join(root, 'reports', '001-acme.md'), 'report body')
    fs.writeFileSync(path.join(root, 'cv.md'), 'private cv')
  })

  it('reads a file inside reports/', () => {
    expect(readReport(root, 'reports/001-acme.md')).toBe('report body')
  })

  it('rejects a traversal that escapes to a sibling file', () => {
    expect(() => readReport(root, '../cv.md')).toThrow()
  })

  it('rejects an absolute path', () => {
    expect(() => readReport(root, path.join(root, 'cv.md'))).toThrow()
  })

  it('rejects a reports-prefixed traversal that escapes dataRoot', () => {
    expect(() => readReport(root, 'reports/../../cv.md')).toThrow()
  })

  it('rejects a non-.md file', () => {
    fs.writeFileSync(path.join(root, 'reports', 'x.txt'), 'x')
    expect(() => readReport(root, 'reports/x.txt')).toThrow()
  })
})

describe('statusCounts', () => {
  it('groups case-insensitively, keeping first-seen display text', () => {
    const apps = [
      { status: 'Applied' }, { status: 'applied' }, { status: 'Rejected' },
    ] as any
    expect(statusCounts(apps)).toEqual({ Applied: 2, Rejected: 1 })
  })
})
