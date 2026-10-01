// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dir = vi.hoisted(() => ({ value: '' }))
const sent = vi.hoisted(() => ({ events: [] as string[] }))
vi.mock('electron', () => ({
  app: { getPath: () => dir.value, getVersion: () => '0.2.0' },
  BrowserWindow: { getAllWindows: () => [{ isDestroyed: () => false, webContents: { send: (c: string) => sent.events.push(c) } }] },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(`enc:${s}`), decryptString: (b: Buffer) => b.toString().replace(/^enc:/, '') },
}))

import { readSettings, writeSettings } from '../context'
import { integrationsHandlers } from '../integrations'
import { readRegistry, writeRegistry } from '../integrations/registry'
import { publicSettings, settingsHandlers as h } from './handlers'
import { keyInfo, setKey } from './keys'

const SENTINEL_OR = 'sk-or-v1-SENTINELsecretvalue0001'
const SENTINEL_ZEN = 'zen-SENTINELsecretvalue0002xx'
const SENTINEL_FC = 'fc-SENTINELsecretvalue0003'
const DAY = 86_400_000
const file = (...p: string[]) => path.join(dir.value, ...p)
const touch = (rel: string, ageDays = 0, bytes = 4) => {
  fs.mkdirSync(path.dirname(file(rel)), { recursive: true })
  fs.writeFileSync(file(rel), 'x'.repeat(bytes))
  const t = new Date(Date.now() - ageDays * DAY)
  fs.utimesSync(file(rel), t, t)
}

beforeEach(() => { dir.value = fs.mkdtempSync(path.join(os.tmpdir(), 'handlers-')); sent.events.length = 0 })
afterEach(() => { fs.rmSync(dir.value, { recursive: true, force: true }); vi.restoreAllMocks() })

describe('prefs', () => {
  it('prefsSet validates, persists, and tells the windows', () => {
    expect(h.prefsSet!({ retention: { runLogDays: 30 }, docs: { humanize: false } })).toMatchObject({ retention: { runLogDays: 30 }, docs: { humanize: false, tone: 'warm' } })
    expect(h.prefsGet!()).toMatchObject({ retention: { runLogDays: 30 } })
    expect(sent.events).toContain('careerloom:settings')
    expect(() => h.prefsSet!({ retention: { runLogDays: -1 } })).toThrow()
    expect(readSettings().prefs.retention.runLogDays).toBe(30)
  })
})

describe('data', () => {
  it('stats, clear and retention prune act on the right folders only', () => {
    touch('run-logs/a.log', 40); touch('run-logs/b.log', 1); touch('threads/t1.json'); touch('threads/t2.json'); touch('copilot/sessions/s1.json')
    expect(h.dataStats!()).toMatchObject({ runLogFiles: 2, threads: 2, copilotSessions: 1 })
    expect(h.retentionPrune!()).toEqual({ removedFiles: 0, freedBytes: 0 }) // forever by default
    h.prefsSet!({ retention: { runLogDays: 30 } })
    expect(h.retentionPrune!()).toMatchObject({ removedFiles: 1 })
    expect(h.dataClear!('chats')).toMatchObject({ removedFiles: 2 })
    expect(fs.existsSync(file('copilot/sessions/s1.json'))).toBe(true)
    expect(h.dataClear!('run-logs')).toMatchObject({ removedFiles: 1 })
    expect(() => h.dataClear!('copilot')).toThrow(/Unknown/)
  })
  it('locations name the folders; careerOps is null until a folder is chosen', () => {
    const locs = h.dataLocations!() as Array<{ id: string; path: string | null }>
    expect(locs.find(l => l.id === 'appData')?.path).toBe(dir.value)
    expect(locs.find(l => l.id === 'careerOps')?.path).toBeNull()
  })
})

describe('settingsReset', () => {
  it('preferences: resets prefs + test results, keeps folder, runner, models and keys', () => {
    writeSettings({ runner: 'codex', models: { codex: 'gpt-5' } })
    h.prefsSet!({ docs: { tone: 'formal' } })
    setKey('openrouter', SENTINEL_OR)
    h.settingsReset!('preferences')
    expect(readSettings()).toMatchObject({ runner: 'codex', models: { codex: 'gpt-5' }, prefs: { docs: { tone: 'warm' } } })
    expect(keyInfo('openrouter').hasKey).toBe(true)
  })
  it('everything: also removes every saved key and model choices; runner is kept', () => {
    writeSettings({ runner: 'codex', models: { codex: 'gpt-5' }, helperModels: { claude: 'haiku' } })
    setKey('openrouter', SENTINEL_OR); setKey('opencode', SENTINEL_ZEN); setKey('firecrawl', SENTINEL_FC)
    const after = h.settingsReset!('everything') as { hasApiKey: boolean; hasOpencodeKey: boolean }
    expect(after).toMatchObject({ hasApiKey: false, hasOpencodeKey: false })
    expect(fs.readdirSync(dir.value).filter(f => f.endsWith('.key'))).toEqual([])
    expect(readSettings()).toMatchObject({ runner: 'codex', models: {}, helperModels: {} })
    expect(() => h.settingsReset!('nope')).toThrow()
  })
})

describe('browser acknowledgements', () => {
  it('lists and revokes one domain', () => {
    writeRegistry({ browser: { ...readRegistry().browser, acks: ['linkedin.com', 'indeed.com'] } })
    expect(h.browserAcks!()).toEqual(['linkedin.com', 'indeed.com'])
    expect(h.browserRevoke!('linkedin.com')).toEqual(['indeed.com'])
    expect(h.browserAcks!()).toEqual(['indeed.com'])
  })
})

describe('diagnostics', () => {
  it('reports tools and memory', () => {
    const d = h.diagnostics!() as { rows: Array<{ id: string }>; memory: { totalBytes: number } }
    expect(d.rows.map(r => r.id)).toEqual(expect.arrayContaining(['node', 'git', 'claude', 'local-model']))
    expect(d.memory.totalBytes).toBeGreaterThan(0)
  })
})

describe('secrets never leave main', () => {
  const SECRETS = [SENTINEL_OR, SENTINEL_ZEN, SENTINEL_FC]
  const leaked = (v: unknown) => { const s = JSON.stringify(v) ?? ''; return SECRETS.find(x => s.includes(x) || s.includes(Buffer.from(x).toString('base64'))) }

  it('no handler response, error or log line contains a saved key (every settings handler + integrations + public settings)', async () => {
    const logs: string[] = []
    for (const m of ['log', 'info', 'warn', 'error', 'debug'] as const) vi.spyOn(console, m).mockImplementation((...a: unknown[]) => { logs.push(a.map(String).join(' ')) })
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{}', { status: 401 })))
    setKey('openrouter', SENTINEL_OR); setKey('opencode', SENTINEL_ZEN); setKey('firecrawl', SENTINEL_FC)

    const calls: Array<[string, unknown[]]> = [
      ['keysList', []], ['keysSet', ['openrouter', SENTINEL_OR]], ['keysSet', ['openrouter', 'bad-' + SENTINEL_OR]], ['keysSet', ['nope', SENTINEL_OR]],
      ['keysTest', ['openrouter']], ['keysTest', ['opencode']], ['keysTest', ['firecrawl']], ['keysTest', ['bogus']],
      ['prefsGet', []], ['prefsSet', [{ docs: { tone: 'concise' } }]], ['prefsSet', [{ docs: { tone: SENTINEL_OR } }]],
      ['browserAcks', []], ['browserRevoke', ['x.com']], ['dataLocations', []], ['dataStats', []], ['dataClear', ['run-logs']], ['dataClear', [SENTINEL_OR]],
      ['retentionPrune', []], ['diagnostics', []],
    ]
    for (const [name, args] of calls) {
      let out: unknown
      try { out = await (h[name] as (...a: unknown[]) => unknown)(...args) } catch (e) { out = { error: e instanceof Error ? e.message : String(e) } }
      expect(leaked(out), `${name}(${JSON.stringify(args).slice(0, 40)})`).toBeUndefined()
    }
    for (const get of [() => publicSettings(), () => integrationsHandlers.listIntegrations!(), () => integrationsHandlers.getIntegration!('service:firecrawl')]) {
      expect(leaked(await get())).toBeUndefined()
    }
    expect(leaked(readSettings())).toBeUndefined()
    expect(leaked(fs.readFileSync(file('settings.json'), 'utf8'))).toBeUndefined()
    expect(logs.find(l => SECRETS.some(s => l.includes(s)))).toBeUndefined()
    // and the keys really are saved, encrypted at rest (the stub encrypts with an 'enc:' prefix; the fakes decrypt it)
    expect(keyInfo('openrouter')).toMatchObject({ hasKey: true, tail: SENTINEL_OR.slice(-4) })
    vi.unstubAllGlobals()
  })
  it('the legacy getSettings shape reports presence only', () => {
    setKey('openrouter', SENTINEL_OR)
    expect(publicSettings()).toMatchObject({ hasApiKey: true, hasOpencodeKey: false })
  })
})
