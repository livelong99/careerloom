// Browser login for web boards: the board's own cookies, from Chrome's profile
// or a cookies.txt export, as a Playwright storage state. Cookie values never
// leave this module in logs or errors. No `electron` import — testable directly.
import { createDecipheriv, pbkdf2Sync } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { domainToASCII } from 'node:url'

import { parse } from 'tldts'

export type PwCookie = { name: string; value: string; domain: string; path: string; expires: number; httpOnly: boolean; secure: boolean; sameSite: 'Strict' | 'Lax' | 'None' }
export type StorageState = { cookies: PwCookie[]; origins: [] }

const MAX_COOKIES_FILE_BYTES = 5 * 1024 * 1024
const SNIFF_BYTES = 4096
const COOKIES_HEADERS = ['# Netscape HTTP Cookie File', '# HTTP Cookie File']
const CHROME_EPOCH_OFFSET_S = 11_644_473_600 // 1601-01-01 → 1970-01-01
const HASH_PREFIX_DB_VERSION = 24 // Chrome prepends SHA256(host) to each value from this DB version on

export const UNSCOPABLE = 'Can\'t scope cookies for this address — use a cookies.txt export instead.'

/** The registrable domain (PSL via tldts): linkedin.com for www.linkedin.com, trust.nhs.uk for
 *  jobs.trust.nhs.uk. Private suffixes count too (foo.github.io stays foo.github.io — narrower,
 *  never wider). Fails closed on IPs, localhost, bare public suffixes and anything unparseable. */
export function registrableDomain(hostname: string): string {
  const ascii = domainToASCII(hostname.trim().replace(/\.+$/, '').toLowerCase())
  const parsed = parse(ascii, { allowPrivateDomains: true })
  if (!ascii || parsed.isIp || !parsed.domain || parsed.domain === parsed.publicSuffix) throw new Error(UNSCOPABLE)
  return parsed.domain
}

/** A cookie host (`.x.com`, `www.x.com`) belongs to `domain` or one of its subdomains — nothing else. */
export function inDomain(cookieHost: string, domain: string): boolean {
  const h = cookieHost.toLowerCase().replace(/^\./, '')
  return h === domain || h.endsWith(`.${domain}`)
}

// ————— cookies.txt (Netscape) —————

export function looksLikeCookiesTxt(head: string): boolean {
  const text = head.replace(/^﻿/, '')
  if (COOKIES_HEADERS.some(h => text.startsWith(h))) return true
  const first = text.split('\n').map(l => l.trimEnd()).find(l => l && (!l.startsWith('#') || l.startsWith('#HttpOnly_')))
  return first !== undefined && first.split('\t').length === 7
}

/** A cookies.txt the user picked: inside $HOME, a file, ≤5 MB, Netscape format. Returns its real path. */
export function validateCookiesFile(file: string, home = os.homedir()): string {
  let real: string
  try { real = fs.realpathSync(file) } catch { throw new Error('The cookies file wasn\'t found — choose it again') }
  const homeReal = fs.realpathSync(home)
  if (!real.startsWith(homeReal + path.sep)) throw new Error('The cookies file must be inside your home folder')
  const stat = fs.statSync(real)
  if (!stat.isFile()) throw new Error('The cookies file must be a file, not a folder')
  if (stat.size > MAX_COOKIES_FILE_BYTES) throw new Error('The cookies file is larger than 5 MB — export only the board\'s site')
  const fd = fs.openSync(real, 'r')
  const head = Buffer.alloc(Math.min(SNIFF_BYTES, stat.size))
  try { fs.readSync(fd, head, 0, head.length, 0) } finally { fs.closeSync(fd) }
  if (!looksLikeCookiesTxt(head.toString('utf8'))) throw new Error('That file isn\'t a cookies.txt export (Netscape format) — export it again')
  return real
}

/** Only `domain`'s cookies from a cookies.txt text; malformed lines skipped. */
export function parseCookiesTxt(text: string, domain: string): PwCookie[] {
  const out: PwCookie[] = []
  for (const raw of text.replace(/^﻿/, '').split(/\r?\n/)) {
    const httpOnly = raw.startsWith('#HttpOnly_')
    const line = httpOnly ? raw.slice('#HttpOnly_'.length) : raw
    if (!line || line.startsWith('#')) continue
    const cols = line.split('\t')
    if (cols.length !== 7) continue
    const [host, , cookiePath, secure, expires, name, value] = cols as [string, string, string, string, string, string, string]
    if (!name || !inDomain(host, domain)) continue
    const exp = Number(expires)
    out.push({ name, value, domain: host, path: cookiePath || '/', expires: exp > 0 ? exp : -1, httpOnly, secure: secure.toUpperCase() === 'TRUE', sameSite: 'Lax' })
  }
  return out
}

// ————— Chrome's Cookies DB —————

const IV_MAC = Buffer.alloc(16, ' ')

/** macOS: the AES-128 key from the Keychain's "Chrome Safe Storage" password. */
export const chromeMacKey = (password: string): Buffer => pbkdf2Sync(password, 'saltysalt', 1003, 16, 'sha1')

export const APP_BOUND = 'app-bound'

/** One encrypted_value → plaintext. macOS: v10 AES-128-CBC. Windows: v10/v11 AES-256-GCM
 *  (12-byte nonce, 16-byte tag); v20 is app-bound encryption — refused, never bypassed. */
export function decryptCookie(enc: Buffer, key: Buffer, platform: NodeJS.Platform, stripHash: boolean): string {
  const prefix = enc.subarray(0, 3).toString('latin1')
  if (prefix === 'v20') throw new Error(APP_BOUND)
  let plain: Buffer
  if (platform === 'darwin') {
    if (prefix !== 'v10') throw new Error('unsupported cookie encryption')
    const d = createDecipheriv('aes-128-cbc', key, IV_MAC)
    plain = Buffer.concat([d.update(enc.subarray(3)), d.final()])
  } else {
    if (prefix !== 'v10' && prefix !== 'v11') throw new Error('unsupported cookie encryption')
    const d = createDecipheriv('aes-256-gcm', key, enc.subarray(3, 15))
    d.setAuthTag(enc.subarray(enc.length - 16))
    plain = Buffer.concat([d.update(enc.subarray(15, enc.length - 16)), d.final()])
  }
  return (stripHash ? plain.subarray(32) : plain).toString('utf8')
}

const SAME_SITE: Record<number, PwCookie['sameSite']> = { 1: 'Lax', 2: 'Strict' }

type Row = { host_key: string; name: string; value: string; encrypted_value: Uint8Array; path: string; expires_s: number; is_secure: number; is_httponly: number; samesite: number }

/** Reads `domain`'s cookies from a Chrome Cookies DB. Works on a temp copy (Chrome locks the
 *  original); the SQL itself only selects the domain's hosts. */
export function readChromeCookies(dbFile: string, domain: string, key: Buffer, platform: NodeJS.Platform = process.platform): PwCookie[] {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-ck-'))
  try {
    for (const suffix of ['', '-wal', '-journal']) {
      if (fs.existsSync(dbFile + suffix)) fs.copyFileSync(dbFile + suffix, path.join(tmp, `Cookies${suffix}`))
    }
    fs.chmodSync(path.join(tmp, 'Cookies'), 0o600)
    const db = new DatabaseSync(path.join(tmp, 'Cookies'), { readOnly: true })
    try {
      const version = Number((db.prepare("SELECT value FROM meta WHERE key = 'version'").get() as { value?: string } | undefined)?.value ?? 0)
      const rows = db.prepare("SELECT host_key, name, value, encrypted_value, path, expires_utc / 1000000 AS expires_s, is_secure, is_httponly, samesite FROM cookies WHERE host_key = ? OR host_key = ? OR host_key LIKE ? ESCAPE '\\'")
        .all(domain, `.${domain}`, `%.${domain.replace(/[\\%_]/g, c => `\\${c}`)}`) as Row[]
      return rows.filter(r => inDomain(r.host_key, domain)).map(r => {
        const enc = Buffer.from(r.encrypted_value ?? [])
        const value = r.value || (enc.length ? decryptCookie(enc, key, platform, version >= HASH_PREFIX_DB_VERSION) : '')
        const expiresS = r.expires_s - CHROME_EPOCH_OFFSET_S // µs since 1601 overflows a JS number; seconds don't
        const secure = r.is_secure === 1
        return {
          name: r.name, value, domain: r.host_key, path: r.path || '/', expires: expiresS > 0 ? Math.floor(expiresS) : -1,
          httpOnly: r.is_httponly === 1, secure, sameSite: r.samesite === 0 && secure ? 'None' : SAME_SITE[r.samesite] ?? 'Lax',
        }
      })
    } finally {
      db.close()
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/** Prefixes of every temp dir that can hold plaintext cookies (DB copies, storage states). */
export const COOKIE_TEMP_PREFIXES = ['cl-ck-', 'cl-bs-']

/** Startup sweep: delete cookie temp dirs a crash left behind. Best effort, silent. */
export function sweepCookieTemp(dir = os.tmpdir()): number {
  let removed = 0
  let names: string[] = []
  try { names = fs.readdirSync(dir) } catch { return 0 }
  for (const name of names) {
    if (!COOKIE_TEMP_PREFIXES.some(p => name.startsWith(p))) continue
    try { fs.rmSync(path.join(dir, name), { recursive: true, force: true }); removed++ } catch { /* in use or gone */ }
  }
  return removed
}

export const storageState = (cookies: PwCookie[]): StorageState => ({ cookies, origins: [] })

/** Chrome's user-data folder (null on unsupported platforms). */
export function chromeUserDataDir(platform: NodeJS.Platform = process.platform, home = os.homedir(), env = process.env): string | null {
  if (platform === 'darwin') return path.join(home, 'Library', 'Application Support', 'Google', 'Chrome')
  if (platform === 'win32' && env.LOCALAPPDATA) return path.join(env.LOCALAPPDATA, 'Google', 'Chrome', 'User Data')
  return null
}

/** Profiles from Chrome's Local State: [{dir: 'Profile 1', name: 'Work'}]. */
export function chromeProfiles(localState: string): Array<{ dir: string; name: string }> {
  try {
    const cache = (JSON.parse(localState) as { profile?: { info_cache?: Record<string, { name?: string }> } }).profile?.info_cache ?? {}
    return Object.entries(cache).map(([dir, v]) => ({ dir, name: v.name || dir }))
  } catch {
    return []
  }
}

/** Chrome's last-used profile dir from Local State, or null. */
export function chromeLastUsed(localState: string): string | null {
  try {
    const last = (JSON.parse(localState) as { profile?: { last_used?: unknown } }).profile?.last_used
    return typeof last === 'string' && last ? last : null
  } catch {
    return null
  }
}

/** The profile's Cookies DB (Windows keeps it under Network/). */
export function cookiesDbPath(userDataDir: string, profile: string): string | null {
  if (!/^(Default|Profile \d{1,3}|Guest Profile)$/.test(profile)) throw new Error('Unknown Chrome profile')
  return [path.join(userDataDir, profile, 'Network', 'Cookies'), path.join(userDataDir, profile, 'Cookies')].find(f => fs.existsSync(f)) ?? null
}
