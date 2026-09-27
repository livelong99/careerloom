import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'
import { parse as parseYaml, parseDocument } from 'yaml'

import { presetBoards, searchProfile, seedDefaults } from './integrations/portal-defaults'
import { readAllSources, removeSources, subsetScanYaml } from './integrations/sources'

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-portals-'))
afterAll(() => fs.rmSync(dir, { recursive: true, force: true }))

const EXAMPLE = `title_filter:
  positive: [engineer]
tracked_companies:
  # ── AI labs ──
  - name: Acme
    careers_url: https://job-boards.greenhouse.io/acme
    enabled: true
  - name: GitLab
    careers_url: https://job-boards.greenhouse.io/gitlab/
    enabled: true
  - name: Old Co
    careers_url: https://jobs.lever.co/oldco
    enabled: false
job_boards:
  # ── SolidJobs ──
  - name: SolidJobs IT
    careers_url: https://solid.jobs/public-api/offers/it
    provider: solidjobs
    enabled: true
  - name: "Telegram @jobs"
    provider: telegram-channel
    channel: jobs
    enabled: false
`
const USER = `# my portals
tracked_companies:
  [
    { name: gitlab, careers_url: https://job-boards.greenhouse.io/gitlab, provider: greenhouse, enabled: true },
    { name: LinkedIn Jobs, careers_url: https://www.linkedin.com/jobs/search/?keywords=x, enabled: true, fetch: browser }
  ]
`
const PROFILE = `target_roles:
  primary: ["Senior Software Engineer (Backend / Full-Stack)", "SDE-2"]
location:
  country: India
  city: Bengaluru
`

describe('default portals', () => {
  it('reads the search profile and builds disabled browser presets', () => {
    const p = searchProfile(PROFILE)
    expect(p).toEqual({ role: 'Senior Software Engineer', city: 'Bengaluru', country: 'India' })
    const presets = presetBoards(p)
    expect(presets.map(b => b.name)).toEqual(['LinkedIn Jobs', 'Naukri', 'Indeed', 'Glassdoor'])
    expect(presets.every(b => b.enabled === false && b.fetch === 'browser')).toBe(true)
    expect(presets[0]!.careers_url).toBe('https://www.linkedin.com/jobs/search/?keywords=Senior+Software+Engineer&location=Bengaluru%2C+India')
    expect(presets[1]!.careers_url).toBe('https://www.naukri.com/senior-software-engineer-jobs-in-bengaluru')
    expect(presets[2]!.careers_url).toBe('https://in.indeed.com/jobs?q=Senior+Software+Engineer&l=Bengaluru')
    expect(presetBoards(searchProfile('')).map(b => b.careers_url)).toEqual([
      'https://www.linkedin.com/jobs/search/?', 'https://www.naukri.com/jobs-in-india', 'https://www.indeed.com/jobs?', 'https://www.glassdoor.com/Job/jobs.htm?',
    ])
  })

  it('merges what the user lacks, keeps enabled flags and comments, never duplicates, is idempotent', () => {
    const doc = parseDocument(USER)
    const added = seedDefaults(doc, EXAMPLE, presetBoards(searchProfile(PROFILE)))
    // Acme, Old Co, SolidJobs IT, Telegram, + Naukri/Indeed/Glassdoor (GitLab by URL and LinkedIn Jobs by name exist)
    expect(added).toBe(7)
    const text = String(doc)
    expect(text).toContain('# my portals')
    expect(text).toContain('# ── AI labs ──')
    expect(text).toContain('# ── SolidJobs ──')
    const js = parseYaml(text)
    expect(js.tracked_companies.map((c: { name: string }) => c.name)).toEqual(['gitlab', 'LinkedIn Jobs', 'Acme', 'Old Co', 'Naukri', 'Indeed', 'Glassdoor'])
    expect(js.tracked_companies.find((c: { name: string }) => c.name === 'Old Co').enabled).toBe(false)
    expect(js.tracked_companies.find((c: { name: string }) => c.name === 'LinkedIn Jobs').enabled).toBe(true) // the user's own entry untouched
    expect(js.job_boards.map((b: { name: string; enabled: boolean }) => [b.name, b.enabled])).toEqual([['SolidJobs IT', true], ['Telegram @jobs', false]])
    expect(js.title_filter).toBeUndefined() // only the two lists are merged
    expect(seedDefaults(doc, EXAMPLE, presetBoards(searchProfile(PROFILE)))).toBe(0)
  })

  it('lists boards with their own ids, deletes from either list, and subsets both for a scan', () => {
    const file = path.join(dir, 'portals.yml')
    const doc = parseDocument(USER)
    seedDefaults(doc, EXAMPLE, [])
    fs.writeFileSync(file, `title_filter:\n  positive: [engineer]\nsearch_queries: [x]\n${String(doc)}`)
    const all = readAllSources(file)
    const solid = all.find(s => s.name === 'SolidJobs IT')!
    expect(solid).toMatchObject({ id: 'board:solidjobs-it', list: 'job_boards' })
    expect(all.find(s => s.name === 'Acme')!.id).toBe('source:acme')

    const scan = parseYaml(subsetScanYaml(fs.readFileSync(file, 'utf8'), [solid, all.find(s => s.name === 'Old Co')!]))
    expect(scan.tracked_companies.map((c: { name: string; enabled: boolean }) => [c.name, c.enabled])).toEqual([['Old Co', true]])
    expect(scan.job_boards.map((c: { name: string }) => c.name)).toEqual(['SolidJobs IT'])
    expect(scan.search_queries).toBeUndefined()
    expect(scan.title_filter).toEqual({ positive: ['engineer'] })

    removeSources(file, [solid, all.find(s => s.name === 'Acme')!])
    const left = readAllSources(file).map(s => s.name)
    expect(left).not.toContain('SolidJobs IT')
    expect(left).not.toContain('Acme')
    expect(left).toContain('Telegram @jobs')
    expect(fs.readFileSync(file, 'utf8')).toContain('# my portals')
  })
})
