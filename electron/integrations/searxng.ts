// SearXNG (self-hosted metasearch) as a managed service next to Firecrawl: install = write settings + pull the pinned image,
// start/stop = compose up/stop, and a started instance is wired into the knowledge-base search settings.
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import type { HealthCheck, IntegrationDetail } from '../contract'
import { userFile } from '../context'
import { readInterviewConfig, writeInterviewConfig } from '../kb/config'
import { resolveBin, spawnSpec } from '../runner'
import { runQuick, parseComposePs } from './firecrawl'
import { readRegistry, writeRegistry } from './registry'
import { parseSearxngUrl } from './searxng-url'
import { newSearxngSecret, SEARXNG_PROJECT, searxngCompose, searxngSettings } from './searxng-compose'

const PULL_TIMEOUT_MS = 10 * 60_000
const START_TIMEOUT_MS = 2 * 60_000
const HEALTH_WAIT_MS = 60_000
let lastLog: string[] = []
const log = (t: string) => { lastLog = [...lastLog, ...t.split('\n').filter(Boolean)].slice(-20) }

const dir = () => userFile('searxng')

/** Writes settings.yml once (keeps the generated secret on later calls). */
function ensureSettings(): void {
  const file = path.join(dir(), 'settings.yml')
  if (fs.existsSync(file)) return
  fs.mkdirSync(dir(), { recursive: true })
  fs.writeFileSync(file, searxngSettings(newSearxngSecret()), { mode: 0o600 })
}

function compose(verb: string[], timeoutMs: number): Promise<{ ok: boolean; output: string }> {
  let spec
  try { spec = spawnSpec('docker', ['compose', '-p', SEARXNG_PROJECT, '-f', '-', ...verb]) } catch (err) { return Promise.resolve({ ok: false, output: err instanceof Error ? err.message : String(err) }) }
  return new Promise(resolve => {
    const child = spawn(spec.bin, spec.args, { env: spec.env, shell: false, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] })
    let output = ''
    const timer = setTimeout(() => { child.kill('SIGTERM'); resolve({ ok: false, output: `${output}\nTimed out after ${Math.round(timeoutMs / 1000)}s` }) }, timeoutMs)
    child.stdout?.setEncoding('utf8').on('data', (t: string) => { output += t })
    child.stderr?.setEncoding('utf8').on('data', (t: string) => { output += t })
    child.on('error', err => { clearTimeout(timer); resolve({ ok: false, output: err.message }) })
    child.on('close', code => { clearTimeout(timer); resolve({ ok: code === 0, output }) })
    child.stdin?.end(searxngCompose(dir()))
  })
}

/** True when the instance answers a JSON search: the KB adapter needs exactly that, so a plain 200 on `/` is not enough. */
export async function searxngJsonOk(url: string): Promise<boolean> {
  try {
    const res = await fetch(`${url}/search?${new URLSearchParams({ q: 'test', format: 'json' })}`, { headers: { accept: 'application/json' }, signal: AbortSignal.timeout(8000) })
    return res.ok && (res.headers.get('content-type') ?? '').includes('json')
  } catch { return false }
}

async function status(url: string) {
  const dockerInstalled = resolveBin('docker') !== null
  if (!dockerInstalled) return { dockerInstalled, dockerRunning: false, running: [] as string[], ready: false }
  const dockerRunning = (await runQuick('docker', ['info', '--format', '{{.ServerVersion}}'])) !== null
  const running = dockerRunning ? parseComposePs((await runQuick('docker', ['compose', '-p', SEARXNG_PROJECT, 'ps', '--format', 'json'])) ?? '') : []
  return { dockerInstalled, dockerRunning, running, ready: running.length > 0 && await searxngJsonOk(url) }
}

export async function searxngDetail(): Promise<IntegrationDetail> {
  const { searxng } = readRegistry()
  let url: string | null = null, urlError: string | null = null
  try { url = parseSearxngUrl(searxng.url) } catch (err) { urlError = err instanceof Error ? err.message : String(err) }
  const st = url ? await status(url) : { dockerInstalled: resolveBin('docker') !== null, dockerRunning: false, running: [] as string[], ready: false }
  const wired = readInterviewConfig().research.search.searxngUrl === url && url !== null
  const checks: HealthCheck[] = [
    { label: 'Address is on this computer', ok: url !== null, detail: urlError ?? undefined },
    { label: 'Docker installed', ok: st.dockerInstalled },
    { label: 'Docker running', ok: st.dockerRunning, optional: !st.dockerInstalled },
    { label: 'Container up', ok: st.running.length > 0, optional: !st.dockerRunning },
    { label: 'JSON search works', ok: st.ready, optional: !st.dockerRunning },
    { label: 'Used by knowledge-base search', ok: wired, optional: true, detail: wired ? undefined : 'Starts automatically once it runs; or pick SearXNG in Settings → Interview prep' },
  ]
  const text = urlError ? 'Misconfigured address' : !st.dockerInstalled ? 'Docker not installed' : st.ready ? 'Running' : st.running.length ? 'Starting…' : st.dockerRunning ? 'Not started' : 'Stopped'
  return {
    id: 'service:searxng', kind: 'service', name: 'SearXNG (self-hosted search)', summary: 'Free web search for the interview knowledge base — no API key',
    status: urlError ? 'error' : !st.dockerInstalled ? 'not_installed' : st.ready ? 'ready' : st.dockerRunning ? 'needs_setup' : 'off', statusText: text,
    installedBy: 'app', source: null,
    actions: st.ready || st.running.length ? ['stop', 'check'] : ['install', 'start', 'check'],
    checks, config: [{ key: 'url', label: 'Address', type: 'url', value: searxng.url, help: 'Must be on this computer. Change it only if you run SearXNG yourself.' }],
    logTail: lastLog, path: dir(),
  }
}

export async function searxngPull(): Promise<IntegrationDetail> {
  ensureSettings()
  const { ok, output } = await compose(['pull'], PULL_TIMEOUT_MS)
  log(output)
  if (!ok) throw new Error('Pulling the SearXNG image failed — see the log below')
  return searxngDetail()
}

export async function searxngStart(): Promise<IntegrationDetail> {
  ensureSettings()
  const url = parseSearxngUrl(readRegistry().searxng.url)
  const { ok, output } = await compose(['up', '-d'], START_TIMEOUT_MS)
  log(output)
  if (!ok) throw new Error('Starting SearXNG failed — see the log below')
  for (const end = Date.now() + HEALTH_WAIT_MS; Date.now() < end;) { if (await searxngJsonOk(url)) break; await new Promise(r => setTimeout(r, 1000)) }
  // Use it for knowledge-base search unless the user already chose an address of their own.
  if (readInterviewConfig().research.search.searxngUrl === null) writeInterviewConfig({ research: { search: { searxngUrl: url } } })
  return searxngDetail()
}

export async function searxngStop(): Promise<IntegrationDetail> {
  const { ok, output } = await compose(['stop'], 20_000)
  log(output)
  if (!ok) throw new Error('Stopping SearXNG failed — see the log below')
  return searxngDetail()
}

export function setSearxngConfig(patch: Record<string, string | boolean | null>): void {
  if (typeof patch.url === 'string' && patch.url) writeRegistry({ searxng: { url: parseSearxngUrl(patch.url) } })
}
