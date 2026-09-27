// Browser login (Integrations → "Browser login"): where a browser board's
// cookies come from — Off, Chrome (a profile) or a cookies.txt — plus the
// Playwright MCP warm-up and per-domain terms acknowledgements. Cookie values
// never reach logs, errors, IPC or the renderer: only counts do.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import type { BrowserLoginStatus, ConfigField, HealthCheck, IntegrationDetail } from '../contract'
import { resolveBin, spawnSpec } from '../runner'
import { PLAYWRIGHT_MCP } from './browser-args'
import {
  APP_BOUND, chromeLastUsed, chromeMacKey, chromeProfiles, chromeUserDataDir, cookiesDbPath, parseCookiesTxt, readChromeCookies, registrableDomain,
  validateCookiesFile, type PwCookie,
} from './browser-cookies'
import { readRegistry, writeRegistry, type BrowserLoginConfig } from './registry'

const SOURCES: BrowserLoginConfig['source'][] = ['off', 'chrome', 'file']
const KEY_TIMEOUT_MS = 90_000 // the Keychain prompt waits on the user
const WARM_TIMEOUT_MS = 5 * 60_000
const FULL_DISK_ACCESS = 'macOS blocked access to Chrome\'s data — allow Careerloom in System Settings › Privacy & Security › Full Disk Access (then restart it), or use a cookies.txt file.'

let cachedKey: Buffer | null = null // derived AES key, main-process memory only, for this session
let lastTest: HealthCheck | null = null
let lastLog: string[] = []

/** argv only; `input` goes on stdin (never argv). Output is returned, never logged. */
function run(bin: string, args: string[], input: string | null, timeoutMs: number): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve, reject) => {
    const spec = spawnSpec(bin, args)
    const child = spawn(spec.bin, spec.args, { env: spec.env, shell: false, windowsHide: true, ...(spec.verbatim ? { windowsVerbatimArguments: true } : {}) })
    let out = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs)
    child.stdout.setEncoding('utf8').on('data', (t: string) => { out += t })
    child.stderr.resume()
    child.on('error', err => { clearTimeout(timer); reject(err) })
    child.on('close', code => { clearTimeout(timer); resolve({ code, out }) })
    child.stdin.end(input ?? '')
  })
}

const DPAPI_SCRIPT = 'Add-Type -AssemblyName System.Security; $b=[Convert]::FromBase64String([Console]::In.ReadToEnd().Trim()); '
  + "[Convert]::ToBase64String([Security.Cryptography.ProtectedData]::Unprotect($b,$null,'CurrentUser'))"

async function chromeKey(userData: string): Promise<Buffer> {
  if (cachedKey) return cachedKey
  if (process.platform === 'darwin') {
    const { code, out } = await run('security', ['find-generic-password', '-w', '-s', 'Chrome Safe Storage'], null, KEY_TIMEOUT_MS)
    if (code !== 0 || !out.trim()) throw new Error('Couldn\'t read Chrome\'s key from the Keychain — click Allow when macOS asks, or use a cookies.txt file.')
    cachedKey = chromeMacKey(out.trim())
  } else if (process.platform === 'win32') {
    let blob: Buffer
    try {
      const localState = JSON.parse(fs.readFileSync(path.join(userData, 'Local State'), 'utf8')) as { os_crypt?: { encrypted_key?: string } }
      blob = Buffer.from(localState.os_crypt?.encrypted_key ?? '', 'base64').subarray(5) // strip "DPAPI"
    } catch { throw new Error('Couldn\'t read Chrome\'s Local State') }
    const { code, out } = await run('powershell', ['-NoProfile', '-NonInteractive', '-Command', DPAPI_SCRIPT], blob.toString('base64'), KEY_TIMEOUT_MS)
    const key = Buffer.from(out.trim(), 'base64')
    if (code !== 0 || key.length !== 32) throw new Error('Couldn\'t unlock Chrome\'s cookie key (Windows DPAPI)')
    cachedKey = key
  } else {
    throw new Error('Reading Chrome cookies works on macOS and Windows — use a cookies.txt file here')
  }
  return cachedKey
}

function readFailure(err: unknown, domain: string): Error {
  const e = err as NodeJS.ErrnoException
  if (e?.message === APP_BOUND) return new Error(`Chrome on Windows protects its cookies from other apps — export a cookies.txt for ${domain} with the "Get cookies.txt LOCALLY" extension and choose it here.`)
  if (e?.code === 'EPERM' || e?.code === 'EACCES') return new Error(process.platform === 'darwin' ? FULL_DISK_ACCESS : 'Permission denied reading Chrome\'s cookies')
  if (e?.code === 'EBUSY') return new Error('Chrome has its cookies locked — close Chrome and try again, or use a cookies.txt file')
  if (e?.message?.startsWith('Couldn\'t') || e?.message?.startsWith('Reading Chrome')) return e
  return new Error(`Couldn't read Chrome's cookies for ${domain}`) // no underlying detail: it could echo data
}

const DEFAULT_WAIT_S = 10
const MAX_WAIT_S = 60
const localState = (dir: string | null) => { try { return dir ? fs.readFileSync(path.join(dir, 'Local State'), 'utf8') : '' } catch { return '' } }

/** The source a scan will actually use: an "off" the user never chose means Chrome's
 *  last-used profile (when Chrome is installed); an explicit choice is kept as is. */
export function effectiveLogin(): BrowserLoginConfig {
  const cfg = readRegistry().browser
  if (cfg.sourceSet || cfg.source !== 'off') return cfg
  const dir = chromeUserDataDir()
  if (!dir || !fs.existsSync(dir)) return cfg
  return { ...cfg, source: 'chrome', profile: chromeLastUsed(localState(dir)) ?? 'Default' }
}

export const pageWaitSeconds = (cfg: BrowserLoginConfig = readRegistry().browser): number =>
  Math.min(MAX_WAIT_S, Math.max(1, Math.round(cfg.pageWait ?? DEFAULT_WAIT_S)))

export const loginLabel = (cfg: BrowserLoginConfig): string =>
  cfg.source === 'chrome' ? `Chrome (${cfg.profile})` : cfg.source === 'file' ? 'cookies.txt' : 'no login'

export function browserLoginStatus(): BrowserLoginStatus {
  const cfg = effectiveLogin()
  return { source: cfg.source, sourceSet: Boolean(cfg.sourceSet), profile: cfg.profile, profiles: profileOptions(), cookiesFile: cfg.cookiesFile, label: loginLabel(cfg), pageWait: pageWaitSeconds(cfg) }
}

/** `domain`'s cookies (and its subdomains' only) from the effective source; [] when Off. */
export async function domainCookies(domain: string): Promise<PwCookie[]> {
  const cfg = effectiveLogin()
  if (cfg.source === 'off') return []
  if (cfg.source === 'file') {
    if (!cfg.cookiesFile) throw new Error('Choose a cookies.txt file in Integrations → Browser login')
    return parseCookiesTxt(fs.readFileSync(validateCookiesFile(cfg.cookiesFile), 'utf8'), domain)
  }
  const userData = chromeUserDataDir()
  if (!userData || !fs.existsSync(userData)) throw new Error('Google Chrome\'s profile folder wasn\'t found')
  try {
    const db = cookiesDbPath(userData, cfg.profile)
    if (!db) throw new Error(`Couldn't find a Cookies database for Chrome profile "${cfg.profile}"`)
    return readChromeCookies(db, domain, await chromeKey(userData))
  } catch (err) {
    throw readFailure(err, domain)
  }
}

// ————— Terms acknowledgements (one per domain, first browser scan) —————

export const isAcknowledged = (domain: string): boolean => readRegistry().browser.acks.includes(domain)
export function acknowledge(domains: string[]): void {
  const cfg = readRegistry().browser
  const clean = domains.flatMap(d => { try { return [registrableDomain(d)] } catch { return [] } })
  writeRegistry({ browser: { ...cfg, acks: [...new Set([...cfg.acks, ...clean])] } })
}

// ————— Integrations card —————

function profileOptions(): string[] {
  const profiles = chromeProfiles(localState(chromeUserDataDir()))
  return profiles.length ? profiles.map(p => p.dir) : ['Default']
}

export function browserLoginDetail(): IntegrationDetail {
  const cfg = effectiveLogin()
  const userData = chromeUserDataDir()
  const chromeFound = Boolean(userData && fs.existsSync(userData))
  let fileError: string | null = null
  if (cfg.source === 'file') { try { validateCookiesFile(cfg.cookiesFile) } catch (err) { fileError = (err as Error).message } }
  const checks: HealthCheck[] = [
    ...(cfg.source === 'chrome' ? [{ label: 'Google Chrome profile found', ok: chromeFound }] : []),
    ...(cfg.source === 'file' ? [{ label: 'cookies.txt is valid', ok: fileError === null, detail: fileError ?? undefined }] : []),
    { label: 'npx available (runs Playwright MCP)', ok: resolveBin('npx') !== null },
    ...(lastTest ? [lastTest] : []),
    ...(cfg.source === 'chrome' && process.platform === 'darwin'
      ? [{ label: 'macOS asks once for Chrome\'s Keychain key', ok: true, optional: true, detail: 'Click "Always Allow" to avoid repeat prompts. If reading fails, grant Full Disk Access.' }]
      : []),
  ]
  const config: ConfigField[] = [
    { key: 'source', label: 'Login source', type: 'text', options: SOURCES, value: cfg.source, help: 'off = public pages only; chrome = your Chrome profile\'s cookies for the board\'s site only; file = a cookies.txt export' },
    ...(cfg.source === 'chrome' ? [{ key: 'profile', label: 'Chrome profile', type: 'text' as const, options: profileOptions(), value: cfg.profile }] : []),
    ...(cfg.source === 'file' ? [{ key: 'cookiesFile', label: 'cookies.txt file', type: 'path' as const, value: cfg.cookiesFile, help: 'Inside your home folder, ≤5 MB, Netscape format' }] : []),
    { key: 'testDomain', label: 'Test domain', type: 'text', value: cfg.testDomain, help: 'Test shows how many cookies Careerloom can read for it — never their values' },
    { key: 'pageWait', label: 'Page load wait (s)', type: 'text', value: String(pageWaitSeconds(cfg)), help: `Seconds the agent waits after each page loads (1–${MAX_WAIT_S}); raise it for slow boards` },
    { key: 'headless', label: 'Hide the browser window', type: 'boolean', value: cfg.headless },
  ]
  return {
    id: 'service:browser', kind: 'service', name: 'Browser login', summary: 'Your login cookies for browser web boards (Playwright MCP + your Chrome)',
    status: cfg.source === 'off' ? 'off' : fileError ? 'error' : 'ready',
    statusText: cfg.source === 'off' ? 'Off — public pages only' : cfg.source === 'chrome' ? `Chrome · ${cfg.profile}` : 'cookies.txt',
    installedBy: 'app', source: null, actions: ['install', 'check'], checks, config, logTail: lastLog, path: null,
  }
}

export function setBrowserLoginConfig(patch: Record<string, string | boolean | null>): void {
  const cfg = effectiveLogin()
  const next = { ...cfg }
  if (typeof patch.source === 'string') {
    if (!SOURCES.includes(patch.source as BrowserLoginConfig['source'])) throw new Error('Login source must be off, chrome or file')
    next.source = patch.source as BrowserLoginConfig['source']
    next.sourceSet = true
  }
  if (typeof patch.pageWait === 'string' || typeof patch.pageWait === 'number') {
    const n = Number(patch.pageWait)
    if (!Number.isFinite(n) || n < 1 || n > MAX_WAIT_S) throw new Error(`Page load wait must be 1–${MAX_WAIT_S} seconds`)
    next.pageWait = Math.round(n)
  }
  if (typeof patch.profile === 'string') {
    if (!profileOptions().includes(patch.profile)) throw new Error('Unknown Chrome profile')
    next.profile = patch.profile
  }
  if (typeof patch.cookiesFile === 'string') next.cookiesFile = patch.cookiesFile.trim() ? validateCookiesFile(patch.cookiesFile.trim()) : ''
  if (typeof patch.testDomain === 'string') {
    const d = patch.testDomain.trim().toLowerCase()
    if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) throw new Error('Test domain must look like github.com')
    next.testDomain = d
  }
  if (typeof patch.headless === 'boolean') next.headless = patch.headless
  if (next.source !== cfg.source || next.profile !== cfg.profile || next.cookiesFile !== cfg.cookiesFile) lastTest = null
  writeRegistry({ browser: next })
}

/** "Test": count the test domain's cookies. Only the count is kept or shown. */
export async function testBrowserLogin(): Promise<IntegrationDetail> {
  const cfg = effectiveLogin()
  let domain = cfg.testDomain
  try {
    domain = registrableDomain(cfg.testDomain)
    const n = (await domainCookies(domain)).length
    lastTest = { label: `Test: ${n} cookie${n === 1 ? '' : 's'} for ${domain}`, ok: cfg.source === 'off' || n > 0, detail: n ? undefined : cfg.source === 'off' ? 'Login source is off' : `Not signed in to ${domain} in this source?` }
  } catch (err) {
    lastTest = { label: `Test: ${domain}`, ok: false, detail: (err as Error).message }
  }
  return browserLoginDetail()
}

/** Warm npx's cache with the pinned Playwright MCP (nothing ships in the installer). */
export async function warmPlaywrightMcp(): Promise<IntegrationDetail> {
  const { code, out } = await run('npx', ['-y', PLAYWRIGHT_MCP, '--version'], null, WARM_TIMEOUT_MS)
  lastLog = [code === 0 ? `${PLAYWRIGHT_MCP} ready (${out.trim()})` : `Fetching ${PLAYWRIGHT_MCP} failed (exit ${code})`]
  if (code !== 0) throw new Error(`Couldn't fetch ${PLAYWRIGHT_MCP} with npx — check your network and Node install`)
  return browserLoginDetail()
}
