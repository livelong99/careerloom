import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: {} }))
vi.mock('node:dns/promises', () => ({ lookup: async (host: string) => [{ address: host === 'intranet.example' ? '10.0.0.5' : '93.184.216.34' }] }))
const { directJd, ensureTracker, parseWorkerResult, profileProblems, workerPrompt } = await import('./jobs-batch')

function tree(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-batch-'))
  for (const [rel, text] of Object.entries(files)) {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), text)
  }
  return dir
}

describe('profileProblems', () => {
  const example = 'candidate:\n  full_name: "Jane Smith"\n'
  it('blocks a template profile', () => {
    const dir = tree({ 'cv.md': '# Me', 'config/profile.yml': example, 'config/profile.example.yml': example, 'modes/_profile.template.md': 'T', 'modes/_profile.md': 'T' })
    expect(profileProblems(dir, dir)).toHaveLength(2)
  })
  it('flags example location and pay even with a real name', () => {
    const ex = 'candidate:\n  full_name: "Jane"\nlocation:\n  city: SF\ncompensation:\n  min: 150000\n'
    const mine = 'candidate:\n  full_name: "Vaibhav"\nlocation:\n  city: SF\ncompensation:\n  min: 150000\n'
    const dir = tree({ 'cv.md': '# Me', 'config/profile.yml': mine, 'config/profile.example.yml': ex, 'modes/_profile.template.md': 'T', 'modes/_profile.md': 'Mine' })
    expect(profileProblems(dir, dir)).toEqual(['config/profile.yml still has the example location, pay targets'])
  })
  it('passes a personalized profile', () => {
    const dir = tree({ 'cv.md': '# Me', 'config/profile.yml': 'candidate:\n  full_name: "Vaibhav"\n', 'config/profile.example.yml': example, 'modes/_profile.template.md': 'T', 'modes/_profile.md': 'Mine' })
    expect(profileProblems(dir, dir)).toEqual([])
  })
})

describe('parseWorkerResult', () => {
  it('reads the last flat JSON summary out of a formatted log', () => {
    const log = '▸ Read cv.md\nsome prose {"status":"failed","report_num":"001"}\nDone:\n{"status":"completed","id":"cl1","report_num":"012","company":"Acme","score":4.3,"pdf":null,"error":null}\n✓ done · $0.40'
    expect(parseWorkerResult(log)).toEqual({ status: 'completed', score: 4.3, report_num: '012', error: null })
    expect(parseWorkerResult('no json here')).toBeNull()
  })
})

describe('workerPrompt', () => {
  it('fills every placeholder, including URLs with query strings and pipes', () => {
    const out = workerPrompt('{{URL}} {{JD_FILE}} {{REPORT_NUM}} {{DATE}} {{ID}} {{URL}}', { url: 'https://x.io/j?a=1|b', jdFile: 'batch/careerloom/a.jd.md', reportNum: '007', date: '2026-09-27', id: 'cl1' })
    expect(out).toBe('https://x.io/j?a=1|b batch/careerloom/a.jd.md 007 2026-09-27 cl1 https://x.io/j?a=1|b')
  })
})

describe('ensureTracker', () => {
  it('creates data/applications.md with the career-ops header once, and never overwrites', () => {
    const dir = tree({})
    ensureTracker(dir)
    const file = path.join(dir, 'data', 'applications.md')
    expect(fs.readFileSync(file, 'utf8')).toContain('| # | Date | Company | Role | Score | Status | PDF | Report | Notes |')
    fs.appendFileSync(file, '| 1 | row |\n')
    ensureTracker(dir)
    expect(fs.readFileSync(file, 'utf8')).toContain('| 1 | row |')
  })

  it('leaves a root-layout applications.md alone', () => {
    const dir = tree({ 'applications.md': 'mine' })
    ensureTracker(dir)
    expect(fs.existsSync(path.join(dir, 'data', 'applications.md'))).toBe(false)
  })
})

describe('directJd', () => {
  // A script-rendered board (Naukri-like): empty app shell, full posting only in JSON-LD.
  const posting = { '@context': 'https://schema.org', '@type': 'JobPosting', title: 'Senior Software Engineer', hiringOrganization: { name: 'Tata Consultancy Services' },
    jobLocation: { address: { addressLocality: 'Bengaluru', addressCountry: 'IN' } }, employmentType: 'FULL_TIME', datePosted: '2026-09-20',
    description: `<p>Build distributed Java services.</p><ul><li>5-7 years</li><li>Spring Boot, Kafka</li></ul>${'<p>Details.</p>'.repeat(80)}` }
  const shell = `<html><head><script type="application/ld+json">${JSON.stringify(posting)}</script></head><body><div id="root"></div><script>app()</script></body></html>`

  it('reads the JobPosting JSON-LD a script-rendered page ships', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response(shell, { status: 200, headers: { 'content-type': 'text/html' } })))
    try {
      const jd = await directJd('https://www.naukri.com/job-listings-senior-software-engineer-060526013409')
      expect(jd).toContain('# Senior Software Engineer')
      expect(jd).toContain('Company: Tata Consultancy Services')
      expect(jd).toContain('Location: Bengaluru, IN')
      expect(jd).toContain('Spring Boot, Kafka')
      expect(jd).not.toContain('<li>')
    } finally { vi.unstubAllGlobals() }
  })

  it('returns empty for a bare app shell, and refuses private redirects', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('<html><body><div id="root"></div></body></html>', { status: 200, headers: { 'content-type': 'text/html' } })))
    try { expect(await directJd('https://jobs.example.com/1')).toBe('') } finally { vi.unstubAllGlobals() }
    vi.stubGlobal('fetch', vi.fn(async () => new Response(null, { status: 302, headers: { location: 'http://intranet.example/admin' } })))
    try { await expect(directJd('https://jobs.example.com/1')).rejects.toThrow(/private/) } finally { vi.unstubAllGlobals() }
  })
})
