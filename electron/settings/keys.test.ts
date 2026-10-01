// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dir = vi.hoisted(() => ({ value: '' }))
vi.mock('electron', () => ({
  app: { getPath: () => dir.value },
  BrowserWindow: { getAllWindows: () => [] },
  safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(`enc:${s}`), decryptString: (b: Buffer) => b.toString().replace(/^enc:/, '') },
}))

import { readSettings } from '../context'
import { keyInfo, keysList, setKey } from './keys'
import { testKey, type KeyTestDeps } from './keys-test'

const OR = 'sk-or-v1-abcdef0123456789SENTINEL'
const ZEN = 'zen_0123456789abcdefSENTINEL'

beforeEach(() => { dir.value = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-')) })
afterEach(() => fs.rmSync(dir.value, { recursive: true, force: true }))

describe('key manager', () => {
  it('lists every provider unset with the runners that need it', () => {
    const rows = keysList()
    expect(rows.map(r => [r.id, r.hasKey, r.tail])).toEqual([['openrouter', false, null], ['opencode', false, null], ['firecrawl', false, null], ['brave', false, null], ['exa', false, null], ['serper', false, null]])
    expect(rows.filter(r => ['brave', 'exa', 'serper'].includes(r.id)).map(r => [r.optional, r.neededByRunners])).toEqual([[true, []], [true, []], [true, []]])
    expect(rows.find(r => r.id === 'openrouter')?.neededByRunners).toEqual(['api'])
    expect(rows.find(r => r.id === 'opencode')?.neededByRunners).toEqual(['zen'])
    expect(rows.find(r => r.id === 'firecrawl')?.optional).toBe(true)
  })
  it('saves a key and exposes only hasKey + the last four characters', () => {
    const info = setKey('openrouter', ` ${OR} `)
    expect(info).toMatchObject({ hasKey: true, tail: OR.slice(-4) })
    expect(JSON.stringify(keysList())).not.toContain(OR)
    expect(JSON.stringify(info)).not.toContain(OR)
    expect(fs.readFileSync(path.join(dir.value, 'openrouter.key'), 'utf8')).toBe(`enc:${OR}`) // trimmed, encrypted at rest
  })
  it('rejects a malformed key without echoing it', () => {
    const bad = 'not-a-key-SENTINEL'
    expect(() => setKey('openrouter', bad)).toThrow(/OpenRouter/)
    try { setKey('openrouter', bad) } catch (e) { expect(String(e)).not.toContain(bad) }
    expect(keyInfo('openrouter').hasKey).toBe(false)
  })
  it.each([['opencode', 'short'], ['firecrawl', 'has space in it'], ['firecrawl', 'x'], ['brave', 'sk-or-notbrave'], ['exa', 'short'], ['serper', 'has-dash-not-allowed-1234']] as const)('%s rejects %j', (id, v) => {
    expect(() => setKey(id, v)).toThrow()
  })
  it('removing clears the file and that key’s last test', async () => {
    setKey('opencode', ZEN)
    await testKey('opencode', { fetch: (async () => new Response('{}', { status: 200 })) as typeof fetch, now: () => 1 })
    expect(readSettings().keyMeta.opencode).toBeDefined()
    expect(setKey('opencode', null).hasKey).toBe(false)
    expect(fs.existsSync(path.join(dir.value, 'opencode.key'))).toBe(false)
    expect(readSettings().keyMeta.opencode).toBeUndefined()
  })
  it('replacing a key clears its stale test result', async () => {
    setKey('openrouter', OR)
    await testKey('openrouter', { fetch: (async () => new Response('{"data":{}}', { status: 200 })) as typeof fetch, now: () => 1 })
    setKey('openrouter', OR.replace('abcdef', 'fedcba'))
    expect(keyInfo('openrouter').lastTest).toBeNull()
  })
})

const reply = (status: number, body: unknown = {}) => (async () => new Response(JSON.stringify(body), { status })) as typeof fetch
let tick = 0
const deps = (f: typeof fetch): KeyTestDeps => ({ fetch: f, now: () => (tick += 40) })

describe('connection tests (cheapest call, no tokens)', () => {
  it('openrouter: GET auth/key with the bearer, ok → result persisted without the key', async () => {
    setKey('openrouter', OR)
    const f = vi.fn(reply(200, { data: { label: 'my key', usage: 1.2, limit: 10 } }))
    const res = await testKey('openrouter', deps(f))
    expect(res).toMatchObject({ ok: true })
    expect(f.mock.calls[0]![0]).toMatch(/\/api\/v1\/auth\/key$/)
    expect((f.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ authorization: `Bearer ${OR}` })
    expect((f.mock.calls[0]![1] as RequestInit).signal).toBeInstanceOf(AbortSignal)
    expect(res.latencyMs).toBe(40)
    expect(readSettings().keyMeta.openrouter).toEqual(res)
    expect(JSON.stringify(readSettings())).not.toContain(OR)
  })
  it.each([[401, /invalid/i], [403, /invalid/i], [402, /credit|quota/i], [429, /rate|quota/i], [500, /HTTP 500/]])('openrouter HTTP %i → clear reason', async (status, re) => {
    setKey('openrouter', OR)
    const res = await testKey('openrouter', deps(reply(status)))
    expect(res.ok).toBe(false)
    expect(res.detail).toMatch(re)
  })
  it('network failure → "could not reach", never the key', async () => {
    setKey('openrouter', OR)
    const res = await testKey('openrouter', deps((async () => { throw new Error(`boom ${OR}`) }) as typeof fetch))
    expect(res).toMatchObject({ ok: false, latencyMs: null })
    expect(res.detail).toMatch(/reach/i)
    expect(JSON.stringify(res)).not.toContain(OR)
  })
  it('zen: lists models with the bearer', async () => {
    setKey('opencode', ZEN)
    const f = vi.fn(reply(200, { data: [] }))
    expect((await testKey('opencode', deps(f))).ok).toBe(true)
    expect(f.mock.calls[0]![0]).toMatch(/\/zen\/v1\/models$/)
  })
  it('keyed providers need a key first', async () => {
    await expect(testKey('openrouter', deps(reply(200)))).rejects.toThrow(/add a key/i)
    await expect(testKey('opencode', deps(reply(200)))).rejects.toThrow(/add a key/i)
  })
  it('search keys: format accepted, test is a stub that makes no request', async () => {
    expect(setKey('brave', `BSA${'a1_-'.repeat(8)}`).hasKey).toBe(true)
    const f = vi.fn(reply(200))
    await expect(testKey('brave', deps(f))).rejects.toThrow(/research/i)
    await expect(testKey('exa', deps(f))).rejects.toThrow(/add a key/i)
    expect(f).not.toHaveBeenCalled()
  })
  it('firecrawl: reachability of the loopback API, works without a key', async () => {
    const f = vi.fn(reply(200))
    expect((await testKey('firecrawl', deps(f))).ok).toBe(true)
    expect(String(f.mock.calls[0]![0])).toMatch(/^http:\/\/127\.0\.0\.1:3002/)
    const down = await testKey('firecrawl', deps((async () => { throw new Error('ECONNREFUSED') }) as typeof fetch))
    expect(down).toMatchObject({ ok: false })
    expect(down.detail).toMatch(/reach/i)
  })
})
