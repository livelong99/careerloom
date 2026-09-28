import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterAll, describe, expect, it } from 'vitest'
import { parse as parseYaml, parseDocument } from 'yaml'

import { BOARD_CATEGORIES, isOldDefault, oldDefaultKeys, presetBoards, searchProfile, seedDefaults } from './integrations/portal-defaults'
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
  it('reads the search profile and builds the India starter pack: 20-25 disabled, categorised boards', () => {
    const p = searchProfile(PROFILE)
    expect(p).toEqual({ role: 'Senior Software Engineer', city: 'Bengaluru', country: 'India' })
    const pack = presetBoards(p)
    expect(pack.length).toBeGreaterThanOrEqual(20)
    expect(pack.length).toBeLessThanOrEqual(25)
    expect(new Set(pack.map(b => b.name)).size).toBe(pack.length)
    expect(pack.every(b => b.enabled === false && (b.fetch === 'browser' || b.fetch === 'firecrawl'))).toBe(true)
    for (const c of BOARD_CATEGORIES) expect(pack.some(b => b.category === c)).toBe(true)
    expect(pack.every(b => (BOARD_CATEGORIES as readonly string[]).includes(b.category!))).toBe(true)
    // Every URL is an Indian board or an India-scoped search.
    expect(pack.every(b => /naukri\.com|\.in\b|india|in\.indeed|apna\.co|internshala|hirist\.tech|cutshort\.io|caclubindia|instahyre|freshersworld|iimjobs|in\.linkedin|linkedin\.com\/jobs\/search\/\?.*(India|Bengaluru)/i.test(b.careers_url!))).toBe(true)
    const byName = Object.fromEntries(pack.map(b => [b.name, b.careers_url]))
    expect(byName['Naukri']).toBe('https://www.naukri.com/senior-software-engineer-jobs-in-bengaluru')
    expect(byName['LinkedIn Jobs']).toBe('https://www.linkedin.com/jobs/search/?keywords=Senior+Software+Engineer&location=Bengaluru%2C+India')
    expect(byName['Indeed India']).toBe('https://in.indeed.com/jobs?q=Senior+Software+Engineer&l=Bengaluru')
    const generic = Object.fromEntries(presetBoards(searchProfile('')).map(b => [b.name, b.careers_url]))
    expect(generic['Naukri']).toBe('https://www.naukri.com/jobs-in-india')
    expect(generic['LinkedIn Jobs']).toBe('https://www.linkedin.com/jobs/search/?location=India')
  })

  it('adds only the pack boards the user lacks, keeps their entries and comments, is idempotent', () => {
    const doc = parseDocument(USER)
    const pack = presetBoards(searchProfile(PROFILE))
    const added = seedDefaults(doc, pack)
    expect(added).toBe(pack.length - 1) // the user's own "LinkedIn Jobs" is kept, not duplicated
    const text = String(doc)
    expect(text).toContain('# my portals')
    const js = parseYaml(text)
    expect(js.tracked_companies[1]).toMatchObject({ name: 'LinkedIn Jobs', enabled: true, careers_url: 'https://www.linkedin.com/jobs/search/?keywords=x' })
    expect(js.tracked_companies.find((c: { name: string }) => c.name === 'iimjobs · Finance')).toMatchObject({ category: 'Finance', enabled: false })
    expect(seedDefaults(doc, pack)).toBe(0)
  })

  it('switching to the pack removes only boards from the old defaults', () => {
    const keys = oldDefaultKeys(EXAMPLE)
    expect(isOldDefault(keys, { name: 'Acme' })).toBe(true)
    expect(isOldDefault(keys, { name: 'gitlab', careers_url: 'https://job-boards.greenhouse.io/gitlab' })).toBe(true) // same URL as the example's GitLab
    expect(isOldDefault(keys, { name: 'SolidJobs IT' })).toBe(true)
    expect(isOldDefault(keys, { name: 'Indeed' })).toBe(true) // old preset
    expect(isOldDefault(keys, { name: 'My startup', careers_url: 'https://jobs.lever.co/mystartup' })).toBe(false)
  })

  it('lists boards with their own ids, deletes from either list, and subsets both for a scan', () => {
    const file = path.join(dir, 'portals.yml')
    fs.writeFileSync(file, `# my portals\nsearch_queries: [x]\n${EXAMPLE}`)
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
