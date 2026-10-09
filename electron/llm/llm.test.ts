// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const dir = vi.hoisted(() => ({ value: '' }))
vi.mock('electron', () => ({ app: { getPath: () => dir.value }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: { isEncryptionAvailable: () => true, encryptString: (s: string) => Buffer.from(s), decryptString: (b: Buffer) => b.toString() } }))

import { readSettings } from '../context'
import { normalizeConfig, readCopilotConfig, writeCopilotConfig } from '../copilot/config'
import { createChatProvider, collectText } from '../copilot/providers/openrouter'
import { parseModelList } from './models'
import { authHeaders, fastModelsFor, isFastModel, PROVIDER_IDS, PROVIDERS, validateCustomBaseUrl } from './providers'
import { hasLlmKey, LlmConfigError, resolveLlm, type ResolveDeps } from './resolve'
import { applyLlmPatch, normalizeLlm } from './settings'

beforeEach(() => { dir.value = fs.mkdtempSync(path.join(os.tmpdir(), 'llm-')) })
afterEach(() => fs.rmSync(dir.value, { recursive: true, force: true }))

describe('registry', () => {
  it('every hosted provider has an https base URL, a models path and a curated fast list', () => {
    for (const id of PROVIDER_IDS) {
      const d = PROVIDERS[id]
      expect(d.id).toBe(id)
      if (id === 'custom') { expect(d.baseUrl).toBeNull(); expect(d.keyOptional).toBe(true); continue }
      expect(d.baseUrl).toMatch(/^https:\/\/[^/]+/)
      expect(d.baseUrl!.endsWith('/')).toBe(false)
      expect(d.modelsPath.startsWith('/')).toBe(true)
      if (id !== 'openrouter') expect(d.fastModels.length).toBeGreaterThan(0)
    }
  })
  it('custom base URL: https anywhere, http only on loopback, no credentials', () => {
    expect(validateCustomBaseUrl('https://llm.example.com/v1/')).toBe('https://llm.example.com/v1')
    expect(validateCustomBaseUrl('http://localhost:11434/v1')).toBe('http://localhost:11434/v1')
    expect(validateCustomBaseUrl('http://127.0.0.1:1234/v1')).toBe('http://127.0.0.1:1234/v1')
    for (const bad of ['http://example.com/v1', 'ftp://x.y', 'https://u:p@h.com/v1', 'https://h.com/v1?k=1', 'nonsense', 42]) expect(() => validateCustomBaseUrl(bad)).toThrow()
  })
  it('auth headers: bearer for all, plus the version header for Anthropic, none without a key', () => {
    expect(authHeaders('openai', 'k')).toEqual({ Authorization: 'Bearer k' })
    expect(authHeaders('anthropic', 'k')).toMatchObject({ 'x-api-key': 'k', 'anthropic-version': expect.any(String) })
    expect(authHeaders('custom', null)).toEqual({})
  })
  it('fast lists: custom is unrestricted, OpenRouter uses the caller-provided tier', () => {
    expect(fastModelsFor('custom', [])).toBeNull()
    expect(fastModelsFor('openrouter', ['a/b'])).toEqual(['a/b'])
    expect(isFastModel('openai', 'gpt-4.1-nano', [])).toBe(true)
    expect(isFastModel('openai', 'o3', [])).toBe(false)
    expect(isFastModel('custom', 'anything', [])).toBe(true)
  })
})

describe('settings.llm', () => {
  it('defaults, drops bad data, validates patches strictly', () => {
    expect(normalizeLlm(undefined)).toEqual({ helper: null, customBaseUrl: null })
    expect(normalizeLlm({ helper: { provider: 'nope' }, customBaseUrl: 'http://evil.com' })).toEqual({ helper: null, customBaseUrl: null })
    const cur = normalizeLlm({})
    expect(applyLlmPatch(cur, { helper: { provider: 'groq', model: 'llama-3.1-8b-instant' } }).helper).toEqual({ provider: 'groq', model: 'llama-3.1-8b-instant' })
    expect(() => applyLlmPatch(cur, { helper: { provider: 'nope' } })).toThrow(/provider/i)
    expect(() => applyLlmPatch(cur, { helper: { provider: 'groq', model: '--flag x' } })).toThrow()
    expect(() => applyLlmPatch(cur, { customBaseUrl: 'http://example.com' })).toThrow()
  })
  it('round-trips through settings.json', async () => {
    const { writeSettings } = await import('../context')
    writeSettings({ llm: applyLlmPatch(readSettings().llm, { helper: { provider: 'mistral', model: null }, customBaseUrl: 'http://localhost:11434/v1' }) })
    expect(readSettings().llm).toEqual({ helper: { provider: 'mistral', model: null }, customBaseUrl: 'http://localhost:11434/v1' })
  })
})

describe('resolveLlm', () => {
  const deps = (over: Partial<ResolveDeps> = {}): ResolveDeps => ({ secret: () => null, assignment: () => null, customBaseUrl: () => null, ...over })
  it('helper with no assignment = null (the runner keeps answering)', () => {
    expect(resolveLlm('helper', deps())).toBeNull()
    expect(hasLlmKey('helper', deps())).toBe(false)
  })
  it('returns provider, model and key', () => {
    const r = resolveLlm('helper', deps({ assignment: () => ({ provider: 'groq', model: 'm' }), secret: id => (id === 'groq' ? 'gsk_x' : null) }))!
    expect(r).toMatchObject({ model: 'm', key: 'gsk_x', baseUrl: 'https://api.groq.com/openai/v1' })
  })
  it('missing key → friendly error naming the provider, never a key', () => {
    const d = deps({ assignment: () => ({ provider: 'openai', model: null }) })
    expect(() => resolveLlm('copilot', d)).toThrow(LlmConfigError)
    expect(() => resolveLlm('copilot', d)).toThrow(/OpenAI key in Settings/)
    expect(hasLlmKey('copilot', d)).toBe(false)
  })
  it('custom: needs an address, key optional', () => {
    const a = deps({ assignment: () => ({ provider: 'custom', model: 'llama3' }) })
    expect(() => resolveLlm('helper', a)).toThrow(/address/)
    expect(resolveLlm('helper', { ...a, customBaseUrl: () => 'http://localhost:11434/v1' })).toMatchObject({ baseUrl: 'http://localhost:11434/v1', key: null })
  })
})

describe('Copilot is fast-models-only', () => {
  it('writes: a non-fast model is rejected in main, a fast one is stored', () => {
    expect(() => writeCopilotConfig({ engine: { models: { fast: 'some/slow-model' } } })).toThrow(/not a fast model/)
    expect(() => writeCopilotConfig({ engine: { provider: 'openai', models: { fast: 'gpt-5-pro' } } })).toThrow(/openai/)
    writeCopilotConfig({ engine: { provider: 'openai', models: { fast: 'gpt-4.1-nano' } } })
    expect(readCopilotConfig().engine).toMatchObject({ provider: 'openai', models: { fast: 'gpt-4.1-nano' } })
  })
  it('switching provider drops models that are not fast for the new one', () => {
    writeCopilotConfig({ engine: { models: { fast: 'openai/gpt-4.1-nano' } } })
    expect(readCopilotConfig().engine.models.fast).toBe('openai/gpt-4.1-nano')
    writeCopilotConfig({ engine: { provider: 'groq' } })
    expect(readCopilotConfig().engine.models.fast).toBeNull()
  })
  it('reads: a hand-edited file cannot smuggle a slow model or an unknown provider in', () => {
    const c = normalizeConfig({ engine: { provider: 'who', models: { fast: 'x/slow', deep: 'openai/gpt-4.1-nano' } } })
    expect(c.engine.provider).toBe('openrouter')
    expect(c.engine.models).toEqual({ fast: null, balanced: null, deep: 'openai/gpt-4.1-nano' })
  })
  it('custom server accepts any model id', () => {
    writeCopilotConfig({ engine: { provider: 'custom', models: { fast: 'llama3.2:3b' } } })
    expect(readCopilotConfig().engine.models.fast).toBe('llama3.2:3b')
  })
})

describe('chat adapter per provider', () => {
  const sse = (text: string) => new Response(`data: ${JSON.stringify({ choices: [{ delta: { content: text } }] })}\n\ndata: ${JSON.stringify({ usage: { prompt_tokens: 3, completion_tokens: 1 }, choices: [] })}\n\ndata: [DONE]\n\n`, { status: 200 })
  const prompt = { system: 's', messages: [{ role: 'user' as const, content: 'hi' }], model: 'm', signal: new AbortController().signal, maxTokens: 50 }
  const run = async (id: keyof typeof PROVIDERS, key: string | null, baseUrl?: string) => {
    const f = vi.fn(async (_u: string, _i: RequestInit) => sse('ok'))
    const out = await collectText(createChatProvider({ spec: PROVIDERS[id], getKey: () => key, fetch: f as unknown as typeof fetch, baseUrl }), prompt)
    return { out, url: String(f.mock.calls[0]![0]), init: f.mock.calls[0]![1] as RequestInit, body: JSON.parse(String((f.mock.calls[0]![1] as RequestInit).body)) as Record<string, unknown> }
  }
  it('openai: own URL, bearer, max_completion_tokens, stream_options, none of the OpenRouter fields', async () => {
    const r = await run('openai', 'sk-test')
    expect(r.url).toBe('https://api.openai.com/v1/chat/completions')
    expect(r.init.headers).toMatchObject({ Authorization: 'Bearer sk-test' })
    expect(r.init.headers).not.toHaveProperty('X-Title')
    expect(r.body).toMatchObject({ stream: true, max_completion_tokens: 50, stream_options: { include_usage: true } })
    for (const k of ['provider', 'usage', 'reasoning', 'session_id', 'max_tokens']) expect(r.body).not.toHaveProperty(k)
    expect(r.out).toEqual({ text: 'ok', usage: expect.objectContaining({ promptTokens: 3 }) })
  })
  it('anthropic: no temperature (rejected by newer models)', async () => {
    expect((await run('anthropic', 'sk-ant-api03-abcdefghij')).body).not.toHaveProperty('temperature')
  })
  it('openrouter keeps its extras', async () => {
    const r = await run('openrouter', 'sk-or-v1-abcdefghij')
    expect(r.body).toMatchObject({ usage: { include: true }, provider: expect.any(Object), reasoning: expect.any(Object), max_tokens: 50 })
    expect(r.init.headers).toMatchObject({ 'X-Title': 'Careerloom' })
  })
  it('custom: no key needed, no Authorization sent, uses the given address', async () => {
    const r = await run('custom', null, 'http://localhost:11434/v1')
    expect(r.url).toBe('http://localhost:11434/v1/chat/completions')
    expect(r.init.headers).not.toHaveProperty('Authorization')
  })
  it('a hosted provider without a key fails with the provider name', async () => {
    await expect(run('groq', null)).rejects.toThrow(/Groq key/)
  })
})

describe('model list parsing', () => {
  it('handles {data}, a bare array and Google ids; drops junk and duplicates', () => {
    expect(parseModelList({ data: [{ id: 'b' }, { id: 'a' }, { id: 'a' }, { nope: 1 }] }).map(m => m.id)).toEqual(['a', 'b'])
    expect(parseModelList([{ id: 'x/y' }]).map(m => m.id)).toEqual(['x/y'])
    expect(parseModelList({ data: [{ id: 'models/gemini-2.5-flash' }] })[0]!.id).toBe('gemini-2.5-flash')
    expect(parseModelList('garbage')).toEqual([])
  })
})
