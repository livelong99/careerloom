import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterAll, describe, expect, it } from 'vitest'

import { boardOrigins, browserAgentArgs, browserPrompt, DENIED_TOOLS, playwrightMcp, READ_ONLY_TOOLS } from './integrations/browser-args'
import {
  APP_BOUND, chromeMacKey, chromeProfiles, decryptCookie, inDomain, looksLikeCookiesTxt, parseCookiesTxt, readChromeCookies, registrableDomain,
  storageState, sweepCookieTemp, UNSCOPABLE, validateCookiesFile,
} from './integrations/browser-cookies'

const home = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), 'cl-home-')))
afterAll(() => fs.rmSync(home, { recursive: true, force: true }))

const TXT = [
  '# Netscape HTTP Cookie File',
  '.github.com\tTRUE\t/\tTRUE\t1893456000\t_gh_sess\tAAA',
  '#HttpOnly_github.com\tFALSE\t/\tTRUE\t0\tuser_session\tBBB',
  'gist.github.com\tFALSE\t/\tFALSE\t1893456000\tg\tCCC',
  '.notgithub.com\tTRUE\t/\tFALSE\t1893456000\tx\tEVIL1',
  'github.com.evil.io\tFALSE\t/\tFALSE\t1893456000\ty\tEVIL2',
  'broken line without tabs',
].join('\n')

describe('registrableDomain / inDomain', () => {
  it('reduces hosts to the registrable domain', () => {
    expect(registrableDomain('www.linkedin.com')).toBe('linkedin.com')
    expect(registrableDomain('jobs.example.co.in')).toBe('example.co.in')
    expect(registrableDomain('github.com')).toBe('github.com')
  })
  it('uses the full public-suffix list and never widens to a suffix', () => {
    expect(registrableDomain('jobs.trust.nhs.uk')).toBe('trust.nhs.uk')
    expect(registrableDomain('x.gov.uk')).toBe('x.gov.uk')
    expect(registrableDomain('careers.foo.co.il')).toBe('foo.co.il')
    expect(registrableDomain('WWW.LinkedIn.COM.')).toBe('linkedin.com')
    expect(registrableDomain('jobs.пример.рф')).toBe('xn--e1afmkfd.xn--p1ai')
    expect(registrableDomain('xn--e1afmkfd.xn--p1ai')).toBe('xn--e1afmkfd.xn--p1ai')
    expect(registrableDomain('me.github.io')).toBe('me.github.io') // private suffix: narrower, not github.io
  })
  it('fails closed on IPs, localhost, bare suffixes and junk', () => {
    for (const h of ['1.2.3.4', '[::1]', '::1', 'localhost', 'gov.uk', 'nhs.uk', 'co.il', '', '..']) expect(() => registrableDomain(h), h).toThrow(UNSCOPABLE)
  })
  it('matches the domain and its subdomains only', () => {
    expect(inDomain('.github.com', 'github.com')).toBe(true)
    expect(inDomain('gist.github.com', 'github.com')).toBe(true)
    expect(inDomain('notgithub.com', 'github.com')).toBe(false)
    expect(inDomain('github.com.evil.io', 'github.com')).toBe(false)
  })
})

describe('cookies.txt', () => {
  it('parses only the domain\'s cookies, with HttpOnly and session expiry', () => {
    const cookies = parseCookiesTxt(TXT, 'github.com')
    expect(cookies.map(c => c.name)).toEqual(['_gh_sess', 'user_session', 'g'])
    expect(cookies[1]).toMatchObject({ httpOnly: true, secure: true, expires: -1, domain: 'github.com' })
    expect(cookies[0]).toMatchObject({ expires: 1893456000, domain: '.github.com', sameSite: 'Lax' })
  })
  it('sniffs the Netscape format', () => {
    expect(looksLikeCookiesTxt('﻿# Netscape HTTP Cookie File\n')).toBe(true)
    expect(looksLikeCookiesTxt('a.com\tTRUE\t/\tFALSE\t0\tn\tv\n')).toBe(true)
    expect(looksLikeCookiesTxt('{"cookies":[]}')).toBe(false)
  })
  it('validates like autoshorts: inside home, a file, ≤5 MB, Netscape', () => {
    const good = path.join(home, 'cookies.txt')
    fs.writeFileSync(good, TXT)
    expect(validateCookiesFile(good, home)).toBe(good)
    const outside = path.join(fs.realpathSync(os.tmpdir()), `cl-out-${Date.now()}.txt`)
    fs.writeFileSync(outside, TXT)
    expect(() => validateCookiesFile(outside, home)).toThrow(/home folder/)
    fs.rmSync(outside)
    const json = path.join(home, 'c.json')
    fs.writeFileSync(json, '{"not":"cookies"}')
    expect(() => validateCookiesFile(json, home)).toThrow(/Netscape/)
    const big = path.join(home, 'big.txt')
    fs.writeFileSync(big, Buffer.alloc(5 * 1024 * 1024 + 1, 'a'))
    expect(() => validateCookiesFile(big, home)).toThrow(/5 MB/)
    expect(() => validateCookiesFile(home, home)).toThrow()
    expect(() => validateCookiesFile(path.join(home, 'missing.txt'), home)).toThrow(/wasn't found/)
  })
  it('never puts a cookie value in an error', () => {
    const bad = path.join(home, 'bad.txt')
    fs.writeFileSync(bad, 'SECRETVALUE123 not cookies')
    try { validateCookiesFile(bad, home) } catch (err) { expect((err as Error).message).not.toContain('SECRETVALUE123') }
  })
})

const macEncrypt = (plain: Buffer, key: Buffer) => {
  const c = createCipheriv('aes-128-cbc', key, Buffer.alloc(16, ' '))
  return Buffer.concat([Buffer.from('v10'), c.update(plain), c.final()])
}

describe('Chrome cookie decryption', () => {
  it('macOS v10: PBKDF2(saltysalt,1003) + AES-128-CBC, strips the SHA256(host) prefix on DB ≥24', () => {
    const key = chromeMacKey('keychain-password')
    expect(key).toHaveLength(16)
    expect(decryptCookie(macEncrypt(Buffer.from('hello'), key), key, 'darwin', false)).toBe('hello')
    const hashed = Buffer.concat([createHash('sha256').update('.github.com').digest(), Buffer.from('hello')])
    expect(decryptCookie(macEncrypt(hashed, key), key, 'darwin', true)).toBe('hello')
  })
  it('Windows v10/v11: AES-256-GCM', () => {
    const key = randomBytes(32)
    const nonce = randomBytes(12)
    const c = createCipheriv('aes-256-gcm', key, nonce)
    const ct = Buffer.concat([c.update('win-value'), c.final()])
    const enc = Buffer.concat([Buffer.from('v10'), nonce, ct, c.getAuthTag()])
    expect(decryptCookie(enc, key, 'win32', false)).toBe('win-value')
  })
  it('detects v20 app-bound encryption and refuses', () => {
    expect(() => decryptCookie(Buffer.concat([Buffer.from('v20'), randomBytes(40)]), randomBytes(32), 'win32', false)).toThrow(APP_BOUND)
  })

  it('reads only the domain\'s rows from a Cookies DB copy', () => {
    const key = chromeMacKey('pw')
    const file = path.join(home, 'Cookies')
    const db = new DatabaseSync(file)
    db.exec("CREATE TABLE meta (key TEXT, value TEXT); INSERT INTO meta VALUES ('version','24');")
    db.exec('CREATE TABLE cookies (host_key TEXT, name TEXT, value TEXT, encrypted_value BLOB, path TEXT, expires_utc INTEGER, is_secure INTEGER, is_httponly INTEGER, samesite INTEGER)')
    const insert = db.prepare('INSERT INTO cookies VALUES (?,?,?,?,?,?,?,?,?)')
    const enc = (host: string, v: string) => macEncrypt(Buffer.concat([createHash('sha256').update(host).digest(), Buffer.from(v)]), key)
    // 2030-01-01 in Chrome's µs-since-1601
    const exp = (1893456000 + 11_644_473_600) * 1e6
    insert.run('.github.com', 'a', '', enc('.github.com', 'va'), '/', exp, 1, 1, 0)
    insert.run('gist.github.com', 'b', 'plain', Buffer.alloc(0), '/', 0, 0, 0, 2)
    insert.run('notgithub.com', 'c', '', enc('notgithub.com', 'evil'), '/', exp, 0, 0, 1)
    insert.run('.evil.io', 'd', '', enc('.evil.io', 'evil'), '/', exp, 0, 0, 1)
    insert.run('x.githubXcom', 'e', 'wildcard', Buffer.alloc(0), '/', exp, 0, 0, 1)
    db.close()
    // LIKE wildcards in the domain are escaped: "a_b.io" must not match "aXb.io"
    expect(readChromeCookies(file, 'github_com', key, 'darwin')).toEqual([])
    const cookies = readChromeCookies(file, 'github.com', key, 'darwin')
    expect(cookies).toEqual([
      { name: 'a', value: 'va', domain: '.github.com', path: '/', expires: 1893456000, httpOnly: true, secure: true, sameSite: 'None' },
      { name: 'b', value: 'plain', domain: 'gist.github.com', path: '/', expires: -1, httpOnly: false, secure: false, sameSite: 'Strict' },
    ])
    expect(storageState(cookies)).toEqual({ cookies, origins: [] })
  })

  it('lists profiles from Local State', () => {
    expect(chromeProfiles(JSON.stringify({ profile: { info_cache: { Default: { name: 'Me' }, 'Profile 2': {} } } })))
      .toEqual([{ dir: 'Default', name: 'Me' }, { dir: 'Profile 2', name: 'Profile 2' }])
    expect(chromeProfiles('not json')).toEqual([])
  })
})

describe('browser agent args', () => {
  const origins = boardOrigins(['https://www.linkedin.com/jobs/search?q=a', 'https://www.linkedin.com/jobs/search?q=b', 'https://in.linkedin.com/jobs'])
  const mcp = playwrightMcp('/tmp/x/state.json', false, origins)
  it('runs the pinned Playwright MCP isolated, seeded from the storage state, locked to the board origins', () => {
    expect(origins).toEqual(['https://www.linkedin.com', 'https://in.linkedin.com'])
    expect(mcp).toEqual({
      command: 'npx',
      args: ['-y', '@playwright/mcp@0.0.82', '--isolated', '--storage-state', '/tmp/x/state.json', '--allowed-origins', 'https://www.linkedin.com;https://in.linkedin.com', '--browser', 'chrome'],
    })
    expect(playwrightMcp('/s.json', true, origins).args).toContain('--headless')
    expect(() => playwrightMcp('/s.json', true, [])).toThrow()
    expect(() => playwrightMcp('/s.json', true, ['https://a.io;https://evil.io'])).toThrow()
  })
  it('the prompt names only the board origins as navigable', () => {
    expect(browserPrompt('B', ['https://jobs.b.io/x'], undefined, 3)).toContain('Only ever navigate to URLs on https://jobs.b.io;')
  })
  it('claude: no built-in tools, strict MCP config, read-only allowlist last', () => {
    const args = browserAgentArgs('claude', 'Go', mcp)!
    expect(args.slice(0, 2)).toEqual(['-p', 'Go'])
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args[args.indexOf('--mcp-config') + 2]).toBe('--strict-mcp-config')
    expect(JSON.parse(args[args.indexOf('--mcp-config') + 1]!)).toEqual({ mcpServers: { clbrowser: { type: 'stdio', ...mcp } } })
    const allowed = args.slice(args.indexOf('--allowedTools') + 1)
    expect(allowed).toEqual(READ_ONLY_TOOLS.map(t => `mcp__clbrowser__${t}`))
    expect(allowed.some(t => /click|type|fill|select|upload|evaluate|run_code|Write|Edit|Bash/.test(t))).toBe(false)
    expect(args).not.toContain('acceptEdits')
  })
  it('codex: read-only sandbox, no shell, MCP limited to the read-only tools', () => {
    const args = browserAgentArgs('codex', 'Go', mcp)!
    expect(args[0]).toBe('exec')
    expect(args).toEqual(expect.arrayContaining(['--sandbox', 'read-only', 'shell_tool', 'unified_exec']))
    expect(args).toContain(`mcp_servers.clbrowser.enabled_tools=${JSON.stringify([...READ_ONLY_TOOLS]).replace(/,/g, ',')}`)
    expect(args).not.toContain('--full-auto')
    expect(args.at(-1)).toBe('Go')
  })
  it('agy and api have no per-run MCP flag', () => {
    expect(browserAgentArgs('antigravity', 'Go', mcp)).toBeNull()
    expect(browserAgentArgs('api', 'Go', mcp)).toBeNull()
  })
  it('the allowlist and the deny list never overlap', () => {
    expect(READ_ONLY_TOOLS.filter(t => (DENIED_TOOLS as readonly string[]).includes(t))).toEqual([])
  })
})

describe('sweepCookieTemp', () => {
  it('removes only cookie temp dirs', () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-sweep-'))
    for (const n of ['cl-bs-abc', 'cl-ck-def', 'other-keep']) { fs.mkdirSync(path.join(dir, n)); fs.writeFileSync(path.join(dir, n, 'f'), 'x') }
    fs.writeFileSync(path.join(dir, 'cl-bs-file'), 'x')
    expect(sweepCookieTemp(dir)).toBe(3)
    expect(fs.readdirSync(dir)).toEqual(['other-keep'])
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
