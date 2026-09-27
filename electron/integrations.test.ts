import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { GITHUB_URL_RE, detectEntrypoints, ghReachable, parseGithubUrl, parseSkillFrontmatter } from './integrations/github'
import {
  addTrackedCompany, parseJobBoardUrl, readTrackedCompanies, removeTrackedCompany, setTrackedCompanyEnabled, slugify, withSourceIds,
} from './integrations/sources'
import { composeArgs, isPrivateHost, parseBaseUrl, parseScrapeResponse, scrapeBody, validateComposeDir, validateScrapeTarget } from './integrations/firecrawl-client'
import { readEnvPresence, upsertEnv } from './integrations/env'

// firecrawl.ts / integrations.ts import context.ts, which imports 'electron' at module scope.
vi.mock('electron', () => ({
  app: { getPath: () => '/tmp' },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => false },
}))
const { parseComposePs } = await import('./integrations/firecrawl')
const { assertCompanyName } = await import('./integrations')

describe('GitHub skill URLs', () => {
  it('accepts a plain github.com/<owner>/<repo> URL, with or without .git/trailing slash', () => {
    expect(parseGithubUrl('https://github.com/MadsLorentzen/ai-job-search')).toEqual({
      owner: 'MadsLorentzen', repo: 'ai-job-search', cloneUrl: 'https://github.com/MadsLorentzen/ai-job-search.git',
    })
    expect(parseGithubUrl('https://github.com/owner/repo.git')?.repo).toBe('repo')
    expect(parseGithubUrl('https://github.com/owner/repo/')?.repo).toBe('repo')
  })

  it('refuses path traversal, SSH form, and other hosts', () => {
    expect(GITHUB_URL_RE.test('https://github.com/a/b/../c')).toBe(false)
    expect(parseGithubUrl('https://github.com/a/b/../c')).toBeNull()
    expect(parseGithubUrl('git@github.com:owner/repo.git')).toBeNull()
    expect(parseGithubUrl('https://gitlab.com/owner/repo')).toBeNull()
    expect(parseGithubUrl('https://github.com/owner')).toBeNull()
    expect(parseGithubUrl('not a url')).toBeNull()
  })

  it('ghReachable resolves false for a bogus host without throwing', async () => {
    await expect(ghReachable('https://github.invalid/nope/nope.git', 500)).resolves.toBe(false)
  })
})

describe('parseSkillFrontmatter', () => {
  it('reads name/description out of SKILL.md frontmatter', () => {
    const md = '---\nname: ai-job-search\ndescription: Finds jobs for you\n---\n\n# Body\n'
    expect(parseSkillFrontmatter(md)).toEqual({ name: 'ai-job-search', description: 'Finds jobs for you' })
  })

  it('returns {} for a file with no frontmatter or malformed YAML', () => {
    expect(parseSkillFrontmatter('# Just a heading')).toEqual({})
    expect(parseSkillFrontmatter('---\n: : broken\n---\nbody')).toEqual({})
  })
})

describe('detectEntrypoints', () => {
  it('finds .claude/skills and .agents/skills SKILL.md files, plus AGENTS.md/CLAUDE.md', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-'))
    fs.mkdirSync(path.join(dir, '.claude', 'skills', 'foo'), { recursive: true })
    fs.writeFileSync(path.join(dir, '.claude', 'skills', 'foo', 'SKILL.md'), '---\nname: foo\ndescription: does foo\n---\n')
    fs.writeFileSync(path.join(dir, 'AGENTS.md'), '# agent instructions')
    const found = detectEntrypoints(dir)
    expect(found).toContainEqual({ rel: path.join('.claude/skills', 'foo', 'SKILL.md'), name: 'foo', description: 'does foo' })
    expect(found.some(f => f.rel === 'AGENTS.md')).toBe(true)
  })

  it('returns [] for a dir with none of the expected files', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skill-empty-'))
    expect(detectEntrypoints(dir)).toEqual([])
  })
})

describe('parseJobBoardUrl', () => {
  it('parses recognized ATS vendors into {provider, slug, careersUrl}', () => {
    expect(parseJobBoardUrl('https://job-boards.greenhouse.io/openai')).toEqual({ provider: 'greenhouse', slug: 'openai', careersUrl: 'https://job-boards.greenhouse.io/openai' })
    expect(parseJobBoardUrl('https://boards.greenhouse.io/stripe')).toEqual({ provider: 'greenhouse', slug: 'stripe', careersUrl: 'https://job-boards.greenhouse.io/stripe' })
    expect(parseJobBoardUrl('https://jobs.lever.co/acme')).toEqual({ provider: 'lever', slug: 'acme', careersUrl: 'https://jobs.lever.co/acme' })
    expect(parseJobBoardUrl('https://jobs.ashbyhq.com/AlephAlpha')).toEqual({ provider: 'ashby', slug: 'AlephAlpha', careersUrl: 'https://jobs.ashbyhq.com/AlephAlpha' })
    expect(parseJobBoardUrl('https://exampleco.breezy.hr')).toEqual({ provider: 'breezy', slug: 'exampleco', careersUrl: 'https://exampleco.breezy.hr' })
  })

  it('returns null for unrecognized hosts or malformed input', () => {
    expect(parseJobBoardUrl('https://example.com/careers')).toBeNull()
    expect(parseJobBoardUrl('not a url')).toBeNull()
    expect(parseJobBoardUrl('ftp://jobs.lever.co/acme')).toBeNull()
  })
})

describe('portals.yml editing preserves comments', () => {
  const setup = () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portals-'))
    const file = path.join(dir, 'portals.yml')
    fs.writeFileSync(file, [
      '# career-ops portal config',
      'tracked_companies:',
      '  - name: Acme',
      '    careers_url: https://job-boards.greenhouse.io/acme',
      '    enabled: true',
      '# trailing note',
      '',
    ].join('\n'))
    return file
  }

  it('adds a company, keeping existing comments intact', () => {
    const file = setup()
    addTrackedCompany(file, { name: 'Stripe', careers_url: 'https://jobs.lever.co/stripe', provider: 'lever', enabled: true })
    const text = fs.readFileSync(file, 'utf8')
    expect(text).toContain('# career-ops portal config')
    expect(text).toContain('# trailing note')
    expect(readTrackedCompanies(file)).toHaveLength(2)
    expect(readTrackedCompanies(file)[1]).toEqual({ name: 'Stripe', careers_url: 'https://jobs.lever.co/stripe', provider: 'lever', enabled: true })
  })

  it('toggles enabled without touching other entries', () => {
    const file = setup()
    const [id] = withSourceIds(readTrackedCompanies(file)).map(c => c.id)
    setTrackedCompanyEnabled(file, id, false)
    expect(readTrackedCompanies(file)[0].enabled).toBe(false)
    expect(fs.readFileSync(file, 'utf8')).toContain('# trailing note')
  })

  it('removes a company by id', () => {
    const file = setup()
    const [id] = withSourceIds(readTrackedCompanies(file)).map(c => c.id)
    removeTrackedCompany(file, id)
    expect(readTrackedCompanies(file)).toHaveLength(0)
  })

  it('slugify dedupes ids for same-named companies', () => {
    const rows = withSourceIds([{ name: 'Acme Corp' }, { name: 'Acme Corp' }])
    expect(rows.map(r => r.id)).toEqual(['source:acme-corp', 'source:acme-corp-2'])
    expect(slugify('  Weird!! Name__2  ')).toBe('weird-name-2')
  })
})

describe('parseComposePs (Firecrawl status)', () => {
  it('parses one-JSON-object-per-line output (Compose >=2.21)', () => {
    const out = [
      JSON.stringify({ Service: 'api', State: 'running' }),
      JSON.stringify({ Service: 'redis', State: 'running' }),
      JSON.stringify({ Service: 'worker', State: 'exited' }),
    ].join('\n')
    expect(parseComposePs(out)).toEqual(['api', 'redis'])
  })

  it('parses a single JSON array (older Compose)', () => {
    const out = JSON.stringify([{ Service: 'api', State: 'running' }, { Service: 'db', State: 'created' }])
    expect(parseComposePs(out)).toEqual(['api'])
  })

  it('returns [] for empty or garbage output', () => {
    expect(parseComposePs('')).toEqual([])
    expect(parseComposePs('not json')).toEqual([])
  })
})

describe('parseBaseUrl (FIRECRAWL_URL must stay on this machine)', () => {
  it('accepts loopback http(s) addresses', () => {
    expect(parseBaseUrl('http://127.0.0.1:3002').toString()).toBe('http://127.0.0.1:3002/')
    expect(parseBaseUrl('http://localhost:4000').toString()).toBe('http://localhost:4000/')
    expect(parseBaseUrl('http://[::1]:3002').toString()).toBe('http://[::1]:3002/')
  })

  it('refuses non-loopback hosts, other schemes, credentials, and garbage', () => {
    for (const bad of ['http://192.168.1.5:3002', 'https://api.firecrawl.dev', 'ftp://127.0.0.1', 'http://u:p@127.0.0.1:3002', 'junk']) {
      expect(() => parseBaseUrl(bad)).toThrow()
    }
  })
})

describe('validateScrapeTarget', () => {
  it('accepts any https page, and http only for a public named host', () => {
    expect(validateScrapeTarget('https://jobs.example.com/123').toString()).toBe('https://jobs.example.com/123')
    expect(validateScrapeTarget('http://jobs.example.com/123').toString()).toBe('http://jobs.example.com/123')
  })

  it('refuses credentials, private/loopback hosts, IP literals over http, and non-URL input', () => {
    for (const bad of [
      'https://user:pw@jobs.example.com/',
      'http://127.0.0.1/',
      'http://192.168.1.5/',
      'http://[::1]/',
      'file:///etc/passwd',
      'javascript:alert(1)',
      'not a url',
    ]) {
      expect(() => validateScrapeTarget(bad)).toThrow()
    }
    const long = `https://jobs.example.com/${'a'.repeat(2048)}`
    expect(() => validateScrapeTarget(long)).toThrow(/too long/)
  })
})

describe('scrapeBody / parseScrapeResponse', () => {
  it('builds the v1/scrape request body', () => {
    const target = validateScrapeTarget('https://jobs.example.com/123')
    expect(scrapeBody(target)).toEqual({ url: 'https://jobs.example.com/123', formats: ['markdown'], onlyMainContent: true })
  })

  it('parses a scrape response into {markdown, title, url}', () => {
    const value = { success: true, data: { markdown: '# Staff Engineer', metadata: { title: 'Staff Engineer — Acme', sourceURL: 'https://jobs.example.com/123' } } }
    expect(parseScrapeResponse(value, 'https://jobs.example.com/123')).toEqual({
      markdown: '# Staff Engineer', title: 'Staff Engineer — Acme', url: 'https://jobs.example.com/123',
    })
  })

  it('falls back gracefully when data/metadata are missing', () => {
    expect(parseScrapeResponse({}, 'https://x.io/1')).toEqual({ markdown: '', title: null, url: 'https://x.io/1' })
    expect(parseScrapeResponse({ success: true, data: {} }, 'https://x.io/1')).toEqual({ markdown: '', title: null, url: 'https://x.io/1' })
  })
})

describe('composeArgs', () => {
  it('pins the bundled project and feeds the file on stdin only for up/pull', () => {
    expect(composeArgs(['up', '-d'], null)).toEqual({ args: ['compose', '-p', 'careerloom-firecrawl', '-f', '-', 'up', '-d'], needsStdin: true })
    expect(composeArgs(['pull'], null)).toEqual({ args: ['compose', '-p', 'careerloom-firecrawl', '-f', '-', 'pull'], needsStdin: true })
    expect(composeArgs(['stop'], null)).toEqual({ args: ['compose', '-p', 'careerloom-firecrawl', 'stop'], needsStdin: false })
    expect(composeArgs(['ps', '--format', 'json'], null).needsStdin).toBe(false)
  })

  it('defers entirely to the external folder’s own compose file when composeDir is set', () => {
    expect(composeArgs(['up', '-d'], '/Users/me/firecrawl-selfhost')).toEqual({ args: ['compose', 'up', '-d'], needsStdin: false })
  })
})

describe('isPrivateHost / validateScrapeTarget (SSRF)', () => {
  it('recognizes every private/loopback form the WHATWG URL parser can produce, IPv4 and IPv6', () => {
    // IPv4 shorthand (127.1, hex, decimal) is canonicalized by `new URL()` itself before we ever see it.
    for (const raw of ['http://127.1/', 'http://0x7f000001/', 'http://2130706433/', 'http://127.0.0.1/', 'http://10.1.2.3/', 'http://192.168.1.1/', 'http://172.16.0.1/', 'http://169.254.1.1/', 'http://100.64.0.1/', 'http://0.0.0.0/']) {
      expect(() => validateScrapeTarget(raw), raw).toThrow()
    }
    // IPv6 loopback/private forms, including an IPv4-mapped private address.
    for (const raw of ['https://[::1]/', 'https://[::ffff:127.0.0.1]/', 'https://[::ffff:192.168.1.1]/', 'https://[fc00::1]/', 'https://[fe80::1]/', 'https://[::]/']) {
      expect(() => validateScrapeTarget(raw), raw).toThrow()
    }
    expect(isPrivateHost('localhost')).toBe(true)
    expect(isPrivateHost('224.0.0.1')).toBe(true) // multicast
  })

  it('still accepts ordinary public https/http targets', () => {
    expect(validateScrapeTarget('https://jobs.example.com/1').toString()).toBe('https://jobs.example.com/1')
    expect(validateScrapeTarget('http://jobs.example.com/1').toString()).toBe('http://jobs.example.com/1')
    expect(isPrivateHost('8.8.8.8')).toBe(false)
    expect(isPrivateHost('jobs.example.com')).toBe(false)
  })
})

describe('parseBaseUrl (FIRECRAWL_URL) rejects the same IPv6 loopback-mapped bypasses', () => {
  it('accepts ::1 and ::ffff:127.0.0.1, refuses non-loopback v6', () => {
    expect(() => parseBaseUrl('http://[::1]:3002')).not.toThrow()
    expect(() => parseBaseUrl('http://[::ffff:127.0.0.1]:3002')).not.toThrow()
    expect(() => parseBaseUrl('http://[fc00::1]:3002')).toThrow()
  })
})

describe('upsertEnv (.env injection)', () => {
  const tmp = () => path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'env-')), '.env')

  it('refuses a value containing a newline, CR, or NUL byte', () => {
    const file = tmp()
    expect(() => upsertEnv(file, 'TAVILY_API_KEY', 'abc\ndef')).toThrow(/newline/)
    expect(() => upsertEnv(file, 'TAVILY_API_KEY', 'abc\rdef')).toThrow(/newline/)
    expect(() => upsertEnv(file, 'TAVILY_API_KEY', 'abc\0def')).toThrow(/newline/)
  })

  it('refuses a key that is not a plausible env var name', () => {
    const file = tmp()
    for (const bad of ['1KEY', '_KEY', 'key', 'KEY-NAME', 'KEY=NAME', 'a'.repeat(65).toUpperCase()]) {
      expect(() => upsertEnv(file, bad, 'v'), bad).toThrow(/Invalid env key/)
    }
  })

  it('writes a valid key/value and reports presence without exposing the value', () => {
    const file = tmp()
    upsertEnv(file, 'TAVILY_API_KEY', 'sk-test-123')
    expect(fs.readFileSync(file, 'utf8')).toContain('TAVILY_API_KEY=sk-test-123')
    expect(readEnvPresence(file, ['TAVILY_API_KEY', 'OTHER_KEY'])).toEqual({ TAVILY_API_KEY: true, OTHER_KEY: false })
  })
})

describe('assertCompanyName (discover-ats argv/flag injection)', () => {
  it('accepts ordinary company names', () => {
    for (const good of ['Stripe', "O'Reilly Media", 'AT&T', 'Acme Corp.', 'Ben & Jerry’s']) {
      expect(() => assertCompanyName(good), good).not.toThrow()
    }
  })

  it('refuses anything that could be read as one of discover-ats.mjs’s own flags, or garbage', () => {
    for (const bad of ['--write', '--self-test', '--help', '-h', '-foo', '', ' Stripe', 'a'.repeat(81), 'foo; rm -rf', 'foo/bar']) {
      expect(() => assertCompanyName(bad), JSON.stringify(bad)).toThrow(/valid company name/)
    }
  })
})

describe('validateComposeDir', () => {
  it('always accepts the empty string (bundled stack)', () => {
    expect(() => validateComposeDir('')).not.toThrow()
  })

  it('refuses a relative path, a missing path, and a folder with no compose file', () => {
    expect(() => validateComposeDir('firecrawl-selfhost')).toThrow(/absolute/)
    expect(() => validateComposeDir('/definitely/not/a/real/path/xyz')).toThrow(/does not exist/)
    const empty = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-empty-'))
    expect(() => validateComposeDir(empty)).toThrow(/no docker-compose/)
  })

  it('accepts a real folder containing a compose file', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'compose-ok-'))
    fs.writeFileSync(path.join(dir, 'docker-compose.yml'), 'services: {}\n')
    expect(() => validateComposeDir(dir)).not.toThrow()
  })
})
