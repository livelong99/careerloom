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
import { PROVIDER_IDS } from '../llm/providers'
import { keyInfo, keysList, setKey } from './keys'
import { testKey, type KeyTestDeps } from './keys-test'

const OR = 'sk-or-v1-abcdef0123456789SENTINEL'
const ZEN = 'zen_0123456789abcdefSENTINEL'

beforeEach(() => { dir.value = fs.mkdtempSync(path.join(os.tmpdir(), 'keys-')) })
afterEach(() => fs.rmSync(dir.value, { recursive: true, force: true }))

describe('key manager', () => {
  it('lists every provider unset with the runners that need it', () => {
    const rows = keysList()
    expect(rows.map(r => [r.id, r.hasKey, r.tail])).toEqual([...PROVIDER_IDS, 'opencode', 'firecrawl', 'brave', 'exa', 'serper'].map(id => [id, false, null]))
    expect(rows.filter(r => r.group === 'ai').map(r => r.id)).toEqual([...PROVIDER_IDS])
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
  it('brave: one tiny query with the subscription header, result stored without the key', async () => {
    const BRAVE = `BSA${'a1_-'.repeat(8)}`
    expect(setKey('brave', BRAVE).hasKey).toBe(true)
    const f = vi.fn(reply(200, { web: { results: [] } }))
    const res = await testKey('brave', deps(f))
    expect(res).toMatchObject({ ok: true, detail: 'Key accepted' })
    expect(f).toHaveBeenCalledTimes(1)
    const url = new URL(String(f.mock.calls[0]![0]))
    expect(url.origin + url.pathname).toBe('https://api.search.brave.com/res/v1/web/search')
    expect(url.searchParams.get('count')).toBe('1')
    expect((f.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ 'x-subscription-token': BRAVE })
    expect(JSON.stringify(readSettings())).not.toContain(BRAVE)
    expect(JSON.stringify(res)).not.toContain(BRAVE)
  })
  it.each([[401, /invalid/i], [429, /rate/i]])('brave HTTP %i → clear reason', async (status, re) => {
    setKey('brave', `BSA${'a1_-'.repeat(8)}`)
    const res = await testKey('brave', deps(reply(status)))
    expect(res.ok).toBe(false)
    expect(res.detail).toMatch(re)
  })
  it('brave without a key makes no request; exa and serper tests are not wired yet', async () => {
    const f = vi.fn(reply(200))
    await expect(testKey('brave', deps(f))).rejects.toThrow(/add a key/i)
    await expect(testKey('exa', deps(f))).rejects.toThrow(/add a key/i)
    setKey('exa', 'a'.repeat(20))
    await expect(testKey('exa', deps(f))).rejects.toThrow(/arrives/i)
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

describe('LLM provider keys', () => {
  it('validates loosely, strictly only where the vendor documents a prefix', () => {
    expect(() => setKey('openai', 'x y z 12345678')).toThrow(/OpenAI/)
    expect(() => setKey('anthropic', 'not-anthropic-key-12345')).toThrow(/Anthropic/)
    expect(setKey('anthropic', 'sk-ant-api03-abcdefghij').hasKey).toBe(true)
    expect(setKey('google', 'AIzaSyA-abcdefghijklmnop').hasKey).toBe(true)
    expect(setKey('groq', 'gsk_abcdefghijklmnop').group).toBe('ai')
    expect(() => setKey('openai', 'short')).toThrow()
  })
  it('error text never echoes the rejected value', () => {
    try { setKey('xai', 'bad key SENTINEL-VALUE') } catch (e) { expect(String(e)).not.toContain('SENTINEL-VALUE') }
  })
  it('stores each provider under its own secret file', () => {
    setKey('mistral', 'm'.repeat(32))
    expect(fs.existsSync(path.join(dir.value, 'mistral.key'))).toBe(true)
  })
  it.each([['openai', 'https://api.openai.com/v1/models'], ['groq', 'https://api.groq.com/openai/v1/models'], ['google', 'https://generativelanguage.googleapis.com/v1beta/openai/models']] as const)('%s: GET the models endpoint with the bearer', async (id, url) => {
    setKey(id, id === 'groq' ? 'gsk_abcdefghijklmnop' : 'k'.repeat(24))
    const f = vi.fn(reply(200, { data: [] }))
    expect((await testKey(id, deps(f))).ok).toBe(true)
    expect(f.mock.calls[0]![0]).toBe(url)
    expect((f.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ Authorization: expect.stringMatching(/^Bearer /) })
  })
  it('anthropic also sends x-api-key and the version header', async () => {
    setKey('anthropic', 'sk-ant-api03-abcdefghij')
    const f = vi.fn(reply(200, { data: [] }))
    await testKey('anthropic', deps(f))
    expect((f.mock.calls[0]![1] as RequestInit).headers).toMatchObject({ 'x-api-key': 'sk-ant-api03-abcdefghij', 'anthropic-version': '2023-06-01' })
  })
  it('a rejected provider key reads as invalid with the provider name', async () => {
    setKey('deepseek', 'd'.repeat(24))
    const res = await testKey('deepseek', deps(reply(401)))
    expect(res).toMatchObject({ ok: false, detail: expect.stringMatching(/DeepSeek rejected/) })
  })
  it('custom server: needs its address, key optional, probes <address>/models', async () => {
    const f = vi.fn(reply(200, { data: [] }))
    expect((await testKey('custom', deps(f))).ok).toBe(false) // no address saved: nothing to reach
    expect(f).not.toHaveBeenCalled()
    const { writeSettings } = await import('../context')
    writeSettings({ llm: { helper: null, customBaseUrl: 'http://localhost:11434/v1' } })
    expect((await testKey('custom', deps(f))).ok).toBe(true)
    expect(f.mock.calls[0]![0]).toBe('http://localhost:11434/v1/models')
    expect((f.mock.calls[0]![1] as RequestInit).headers).toEqual({})
  })
})
