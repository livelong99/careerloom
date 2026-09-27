import { createCipheriv, createHash, randomBytes } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterAll, describe, expect, it } from 'vitest'

import { blockedMessage, boardOrigins, browserAgentArgs, browserPrompt, DENIED_TOOLS, navLockScript, playwrightMcp, READ_ONLY_TOOLS } from './integrations/browser-args'
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
  const mcp = playwrightMcp('/tmp/x/state.json', false, '/tmp/x/nav-lock.cjs')
  it('runs the pinned Playwright MCP isolated, seeded from the storage state, nav-locked, with long load timeouts', () => {
    expect(mcp).toEqual({
      command: 'npx',
      args: [
        '-y', '@playwright/mcp@0.0.82', '--isolated', '--storage-state', '/tmp/x/state.json', '--init-page', '/tmp/x/nav-lock.cjs',
        '--timeout-navigation', '60000', '--timeout-settle', '3000', '--caps', 'vision', '--snapshot-mode', 'none', '--browser', 'chrome',
      ],
    })
    expect(playwrightMcp('/s.json', true, '/n.cjs').args).toContain('--headless')
    expect(boardOrigins(['https://www.linkedin.com/a?q=1', 'https://www.linkedin.com/b', 'https://in.linkedin.com/c'])).toEqual(['https://www.linkedin.com', 'https://in.linkedin.com'])
  })
  it('the nav lock aborts only main-frame navigations off the board domain', async () => {
    const mod: { exports: { allowed?: (u: string) => boolean; default?: (a: { page: unknown }) => Promise<void> } } = { exports: {} }
    new Function('module', navLockScript('linkedin.com'))(mod)
    const allowed = mod.exports.allowed!
    for (const u of ['https://www.linkedin.com/jobs', 'https://linkedin.com/', 'https://in.linkedin.com/x', 'about:blank']) expect(allowed(u), u).toBe(true)
    for (const u of ['https://attacker.com/?d=x', 'https://linkedin.com.evil.io/', 'https://notlinkedin.com/', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x']) expect(allowed(u), u).toBe(false)
    const mainFrame = {}
    let handler: ((r: unknown) => unknown) | null = null
    const moves: number[][] = []
    await mod.exports.default!({ page: {
      mainFrame: () => mainFrame, route: async (_: string, h: (r: unknown) => unknown) => { handler = h },
      evaluate: async () => [1200, 800], mouse: { move: async (x: number, y: number) => { moves.push([x, y]) } },
    } })
    expect(moves).toEqual([[300, 480]])
    const route = (url: string, nav: boolean, frame: unknown) => ({ request: () => ({ url: () => url, isNavigationRequest: () => nav, frame: () => frame }), abort: () => 'abort', continue: () => 'continue' })
    expect(handler!(route('https://attacker.com/', true, mainFrame))).toBe('abort')
    expect(handler!(route('https://static.licdn.com/app.js', false, mainFrame))).toBe('continue') // CDN subresource
    expect(handler!(route('https://ads.example/frame', true, {}))).toBe('continue') // iframe
    expect(handler!(route('https://www.linkedin.com/jobs', true, mainFrame))).toBe('continue')
    expect(() => navLockScript('evil.io"; process.exit(1); "')).toThrow()
  })
  it('the prompt waits after each navigation and names only the board origins', () => {
    const prompt = browserPrompt('B', ['https://jobs.b.io/x'], undefined, 3, 12)
    expect(prompt).toContain('Only ever navigate to URLs on https://jobs.b.io;')
    expect(prompt).toContain('browser_navigate, then browser_wait_for time 12')
    expect(prompt).toContain('at most 2 browser_snapshot calls per page')
    expect(prompt).toContain('Do NOT snapshot yet: call browser_mouse_wheel with deltaY 1500 and browser_wait_for time 6 — 5 times in a row')
    expect(prompt).toContain('(3) ONE browser_snapshot')
    expect(prompt).toContain('browser_snapshot {"target": "<css>"}')
    expect(prompt).toContain('Never pass a filename')
    expect(prompt).toContain('Never a third on the same page')
    expect(prompt).not.toContain('re-snapshot')
  })
  it('claude: no built-in tools, strict MCP config, read-only allowlist last', () => {
    const args = browserAgentArgs('claude', 'Go', mcp)!
    expect(args.slice(0, 2)).toEqual(['-p', 'Go'])
    expect(args[args.indexOf('--tools') + 1]).toBe('')
    expect(args[args.indexOf('--mcp-config') + 2]).toBe('--strict-mcp-config')
    expect(JSON.parse(args[args.indexOf('--mcp-config') + 1]!)).toEqual({ mcpServers: { clbrowser: { type: 'stdio', ...mcp } } })
    const allowed = args.slice(args.indexOf('--allowedTools') + 1)
    expect(allowed).toEqual(READ_ONLY_TOOLS.map(t => `mcp__clbrowser__${t}`))
    expect(allowed.some(t => /click|type|fill|select|upload|evaluate|run_code|press|drag|move|down|up$|hover|screenshot|Write|Edit|Bash/.test(t))).toBe(false)
    expect(allowed).toContain('mcp__clbrowser__browser_mouse_wheel') // scroll only
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

describe('blockedMessage', () => {
  it('names the cookie count and source, never values', () => {
    expect(blockedMessage('linkedin.com', 'Sign in page', 33, 'Chrome (Default)'))
      .toBe('Linkedin asked you to sign in (Sign in page) — Careerloom loaded 33 cookies from Chrome (Default). Check you\'re signed in to that Chrome profile, or pick another in Integrations → Browser login.')
    expect(blockedMessage('naukri.com', 'login', 0, 'no login')).toContain('Careerloom used no login')
  })
})
