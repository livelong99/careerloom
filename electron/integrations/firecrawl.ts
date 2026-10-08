// Firecrawl (self-hosted): a Docker Compose stack, run with our own bundled,
// pinned, loopback-only compose file (or an external folder's own, when the
// user points `composeDir` at one). Docker is always spawned with argv only.
import { spawn } from 'node:child_process'
import { lookup as dnsLookup } from 'node:dns/promises'

import type { ConfigField, HealthCheck, IntegrationDetail } from '../contract'
import { readSecret } from '../context'
import { setKey } from '../settings/keys'
import { resolveBin, spawnSpec } from '../runner'
import { composeArgs, isPrivateHost, parseBaseUrl, parseScrapeResponse, scrapeBody, validateComposeDir, validateScrapeTarget, type ScrapedPage, type ScrapeOptions } from './firecrawl-client'
import { FIRECRAWL_COMPOSE } from './firecrawl-compose'
import { readRegistry, writeRegistry } from './registry'

const QUICK_TIMEOUT_MS = 8_000
const PULL_TIMEOUT_MS = 10 * 60_000 // image pulls are large; give them room
const START_TIMEOUT_MS = 2 * 60_000
const HEALTH_WAIT_MS = 120_000
// Scrape request budget: a short connect-style check so a down stack fails
// fast (see `apiHealthy`), then the real request gets the full budget.
const CONNECT_TIMEOUT_MS = 3_000
const OVERALL_TIMEOUT_MS = 45_000
const MAX_RESPONSE_BYTES = 4 * 1024 * 1024

/** Last output of a compose command, for the detail panel's log tail. Purely
 *  in-memory — it is status/debugging output, not something worth persisting. */
let lastLog: string[] = []
const LOG_CAP = 20

function appendLog(text: string): void {
  lastLog = [...lastLog, ...text.split('\n').filter(Boolean)].slice(-LOG_CAP)
}

/** Runs `docker compose ...verb`, feeding the bundled compose file on stdin
 *  when needed. `composeDir` (non-empty) uses that folder's own compose file
 *  and its own default project instead. */
function runCompose(verb: string[], composeDir: string | null, timeoutMs: number): Promise<{ ok: boolean; output: string }> {
  // Re-validated here (not just when saved): the folder could have been
  // moved/emptied since, and this is the last check before we run docker in it.
  if (composeDir) validateComposeDir(composeDir)
  let spec
  try { spec = spawnSpec('docker', composeArgs(verb, composeDir).args) } catch (err) {
    return Promise.resolve({ ok: false, output: err instanceof Error ? err.message : String(err) })
  }
  const { needsStdin } = composeArgs(verb, composeDir)
  return new Promise(resolve => {
    const child = spawn(spec.bin, spec.args, { cwd: composeDir ?? undefined, env: spec.env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); resolve({ ok: false, output: `${output}\nTimed out after ${Math.round(timeoutMs / 1000)}s` }) }, timeoutMs)
    child.stdout?.setEncoding('utf8').on('data', (t: string) => { output += t })
    child.stderr?.setEncoding('utf8').on('data', (t: string) => { output += t })
    child.on('error', err => { clearTimeout(timer); resolve({ ok: false, output: err.message }) })
    child.on('close', code => { clearTimeout(timer); resolve({ ok: code === 0, output }) })
    if (needsStdin) { child.stdin?.write(FIRECRAWL_COMPOSE); child.stdin?.end() }
    else child.stdin?.end()
  })
}

export function runQuick(bin: string, args: string[], cwd?: string): Promise<string | null> {
  let spec
  try { spec = spawnSpec(bin, args) } catch { return Promise.resolve(null) }
  return new Promise(resolve => {
    const child = spawn(spec.bin, spec.args, { cwd, env: spec.env, shell: false, windowsHide: true })
    let out = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); resolve(null) }, QUICK_TIMEOUT_MS)
    child.stdout?.setEncoding('utf8').on('data', (t: string) => { out += t })
    child.on('error', () => { clearTimeout(timer); resolve(null) })
    child.on('close', code => { clearTimeout(timer); resolve(code === 0 ? out : null) })
  })
}

/** `docker compose ps --format json` prints one JSON object per line (Compose
 *  ≥2.21) or a single JSON array (older). */
export function parseComposePs(out: string): string[] {
  const trimmed = out.trim()
  let rows: Array<{ State?: string; Service?: string }> = []
  try {
    const parsed: unknown = JSON.parse(trimmed)
    rows = Array.isArray(parsed) ? parsed as typeof rows : []
  } catch {
    rows = trimmed.split('\n').filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line) as { State?: string; Service?: string }] } catch { return [] }
    })
  }
  return rows.filter(r => r.State === 'running').map(r => r.Service).filter((s): s is string => Boolean(s))
}

export type FirecrawlStatus = { dockerInstalled: boolean; dockerRunning: boolean; running: string[]; apiHealthy: boolean }

async function apiHealthy(url: string): Promise<boolean> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(CONNECT_TIMEOUT_MS) })
    return res.ok
  } catch {
    return false
  }
}

export async function firecrawlStatus(url: string, composeDir: string | null): Promise<FirecrawlStatus> {
  const dockerInstalled = resolveBin('docker') !== null
  if (!dockerInstalled) return { dockerInstalled: false, dockerRunning: false, running: [], apiHealthy: false }
  const info = await runQuick('docker', ['info', '--format', '{{.ServerVersion}}'])
  const dockerRunning = info !== null
  const running = dockerRunning ? parseComposePs((await runQuick('docker', composeArgs(['ps', '--format', 'json'], composeDir).args, composeDir ?? undefined)) ?? '') : []
  return { dockerInstalled, dockerRunning, running, apiHealthy: dockerRunning ? await apiHealthy(url) : false }
}

function firecrawlConfigFields(url: string, composeDir: string): ConfigField[] {
  return [
    { key: 'url', label: 'API URL', type: 'url', value: url, help: 'Must be a loopback address (127.0.0.1/localhost)' },
    { key: 'composeDir', label: 'External compose folder (optional)', type: 'path', value: composeDir, help: 'Leave empty to use the bundled scrape+map-only stack' },
    { key: 'apiKey', label: 'API key (optional)', type: 'secret', value: readSecret('firecrawl') !== null ? 'set' : null, help: 'Only needed if your own stack enforces auth' },
  ]
}

export async function firecrawlDetail(): Promise<IntegrationDetail> {
  const { firecrawl } = readRegistry()
  let base: URL | null = null
  let urlError: string | null = null
  try { base = parseBaseUrl(firecrawl.url) } catch (err) { urlError = err instanceof Error ? err.message : String(err) }
  let composeDirError: string | null = null
  if (firecrawl.composeDir) { try { validateComposeDir(firecrawl.composeDir) } catch (err) { composeDirError = err instanceof Error ? err.message : String(err) } }
  const composeDir = composeDirError ? null : (firecrawl.composeDir || null)
  const status = base ? await firecrawlStatus(base.toString(), composeDir) : { dockerInstalled: resolveBin('docker') !== null, dockerRunning: false, running: [], apiHealthy: false }
  const checks: HealthCheck[] = [
    { label: 'FIRECRAWL_URL is a loopback address', ok: base !== null, detail: urlError ?? undefined },
    ...(firecrawl.composeDir ? [{ label: 'External compose folder is valid', ok: composeDirError === null, detail: composeDirError ?? undefined }] : []),
    { label: 'Docker installed', ok: status.dockerInstalled },
    { label: 'Docker running', ok: status.dockerRunning, optional: !status.dockerInstalled },
    { label: 'Containers up', ok: status.running.length > 0, optional: !status.dockerRunning },
    { label: 'API healthy', ok: status.apiHealthy, optional: !status.dockerRunning },
  ]
  const ready = base !== null && !composeDirError && status.apiHealthy && status.running.length > 0
  const statusValue = urlError || composeDirError ? 'error' : !status.dockerInstalled ? 'not_installed' : ready ? 'ready' : status.dockerRunning ? 'needs_setup' : 'off'
  const statusText = urlError ? 'Misconfigured URL'
    : composeDirError ? 'Misconfigured compose folder'
      : !status.dockerInstalled ? 'Docker not installed'
        : ready ? `Running (${status.running.length} services)`
          : status.dockerRunning ? (status.running.length > 0 ? 'Starting…' : 'Not pulled/started')
            : 'Stopped'
  return {
    id: 'service:firecrawl', kind: 'service', name: 'Firecrawl (self-hosted)', summary: 'Self-hosted scrape/map API for job-page extraction',
    status: statusValue, statusText, installedBy: 'app', source: firecrawl.composeDir || null,
    actions: ready ? ['stop', 'check'] : status.running.length > 0 ? ['stop', 'check'] : ['install', 'start', 'check'],
    checks, config: firecrawlConfigFields(firecrawl.url, firecrawl.composeDir), logTail: lastLog, path: firecrawl.composeDir || null,
  }
}

/** `docker compose pull` — downloads the pinned images without starting anything. */
export async function firecrawlPull(): Promise<IntegrationDetail> {
  const { firecrawl } = readRegistry()
  const { ok, output } = await runCompose(['pull'], firecrawl.composeDir || null, PULL_TIMEOUT_MS)
  appendLog(output)
  if (!ok) throw new Error('Pulling the Firecrawl images failed — see the log below')
  return firecrawlDetail()
}

async function waitHealthy(url: string): Promise<void> {
  const deadline = Date.now() + HEALTH_WAIT_MS
  while (Date.now() < deadline) {
    if (await apiHealthy(url)) return
    await new Promise(r => setTimeout(r, 1000))
  }
  // Not an error: containers may still be warming up. The detail panel's
  // health checks show the real state on the next poll.
}

export async function firecrawlStart(): Promise<IntegrationDetail> {
  const { firecrawl } = readRegistry()
  const { ok, output } = await runCompose(['up', '-d', '--no-build'], firecrawl.composeDir || null, START_TIMEOUT_MS)
  appendLog(output)
  if (!ok) throw new Error('Starting Firecrawl failed — see the log below')
  const base = parseBaseUrl(firecrawl.url)
  await waitHealthy(base.toString())
  return firecrawlDetail()
}

/** Stops the containers. Never removes them or their volumes. */
export async function firecrawlStop(): Promise<IntegrationDetail> {
  const { firecrawl } = readRegistry()
  const { ok, output } = await runCompose(['stop'], firecrawl.composeDir || null, QUICK_TIMEOUT_MS * 2)
  appendLog(output)
  if (!ok) throw new Error('Stopping Firecrawl failed — see the log below')
  return firecrawlDetail()
}

export function setFirecrawlConfig(patch: Record<string, string | boolean | null>): void {
  const { firecrawl } = readRegistry()
  const next = { ...firecrawl }
  if (typeof patch.url === 'string' && patch.url) { parseBaseUrl(patch.url); next.url = patch.url }
  if (typeof patch.composeDir === 'string') { validateComposeDir(patch.composeDir); next.composeDir = patch.composeDir }
  writeRegistry({ firecrawl: next })
  if ('apiKey' in patch) setKey('firecrawl', typeof patch.apiKey === 'string' && patch.apiKey ? patch.apiKey : null)
}

export async function firecrawlReady(): Promise<boolean> {
  const { firecrawl } = readRegistry()
  try { return (await firecrawlStatus(parseBaseUrl(firecrawl.url).toString(), firecrawl.composeDir || null)).apiHealthy } catch { return false }
}

/** The configured Firecrawl base URL, validated as loopback. Throws the same
 *  message `firecrawlDetail`'s "Misconfigured URL" check surfaces. */
export function firecrawlBaseUrl(): string {
  return parseBaseUrl(readRegistry().firecrawl.url).toString()
}

async function readCapped(res: Response): Promise<unknown> {
  const len = res.headers.get('content-length')
  if (len && Number(len) > MAX_RESPONSE_BYTES) throw new Error(`Firecrawl's answer is larger than ${MAX_RESPONSE_BYTES / (1024 * 1024)} MB.`)
  const reader = res.body?.getReader()
  if (!reader) return res.json()
  const chunks: Uint8Array[] = []
  let total = 0
  for (;;) {
    const { done, value } = await reader.read()
    if (done) break
    total += value.byteLength
    if (total > MAX_RESPONSE_BYTES) { await reader.cancel(); throw new Error(`Firecrawl's answer is larger than ${MAX_RESPONSE_BYTES / (1024 * 1024)} MB.`) }
    chunks.push(value)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'))
}

/** DNS-rebinding guard: `validateScrapeTarget` only catches a literal private
 *  IP in the URL itself — a plain hostname could still resolve to one (a
 *  malicious or misconfigured DNS record). Resolves it for real and refuses
 *  if ANY answer is private, so a target that passes the pure check can't
 *  reach an internal address at request time either. */
export async function assertPublicResolution(hostname: string): Promise<void> {
  const host = hostname.startsWith('[') && hostname.endsWith(']') ? hostname.slice(1, -1) : hostname
  let records: Array<{ address: string }>
  try { records = await dnsLookup(host, { all: true }) } catch { throw new Error(`Could not resolve ${host}`) }
  if (records.some(r => isPrivateHost(r.address))) throw new Error(`${host} resolves to a private address — refused`)
}

/** Scrapes one page via the self-hosted Firecrawl API. A quick reachability
 *  check first (≈ a 3s connect timeout) fails fast with the app's own message
 *  instead of waiting out the full request timeout when the stack is down. */
export async function firecrawlScrape(url: string, opts: ScrapeOptions = {}): Promise<ScrapedPage> {
  const target = validateScrapeTarget(url)
  await assertPublicResolution(target.hostname)
  const { firecrawl } = readRegistry()
  const base = parseBaseUrl(firecrawl.url)
  if (!(await apiHealthy(base.toString()))) throw new Error('Firecrawl is not running — start it in Integrations')
  const key = readSecret('firecrawl')
  const endpoint = new URL('/v1/scrape', base)
  let res: Response
  try {
    res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(key ? { authorization: `Bearer ${key}` } : {}) },
      body: JSON.stringify(scrapeBody(target, opts)),
      signal: AbortSignal.timeout(OVERALL_TIMEOUT_MS),
    })
  } catch {
    throw new Error('Firecrawl is not running — start it in Integrations')
  }
  if (!res.ok) throw new Error(`Firecrawl failed (${res.status}) scraping ${target.toString()}`)
  const value = await readCapped(res)
  return parseScrapeResponse(value, target.toString())
}
