import { describe, expect, it } from 'vitest'
import { curatedModels, listLlmModels, testLlmModel, type ModelListDeps } from './models'
import type { AnswerProvider } from './engine'
import { LlmError } from './providers/openrouter'
import type { LlmModelInfo } from './types'

const m = (id: string, name = id): LlmModelInfo => ({ id, name, contextTokens: 1000, promptUsdPerM: 1, completionUsdPerM: 2, dataPolicy: 'unknown', supportsStreaming: true })
function deps(over: Partial<ModelListDeps> & { cache?: { at: number; models: LlmModelInfo[] } | null } = {}) {
  let cache = over.cache ?? null
  const writes: unknown[] = []
  let fetches = 0
  const d: ModelListDeps = { fetchModels: over.fetchModels ?? (async () => { fetches++; return [m('z/zed', 'Zed'), m('a/alpha', 'Alpha')] }), readCache: () => cache, writeCache: c => { cache = c; writes.push(c) }, now: over.now ?? (() => 1_000_000) }
  return { d, writes, fetches: () => fetches }
}

describe('listLlmModels', () => {
  it('puts curated models first (with live prices), then the rest by name, and caches', async () => {
    const curated = curatedModels()[0]!
    const { d, writes } = deps({ fetchModels: async () => [m('z/zed', 'Zed'), m('a/alpha', 'Alpha'), { ...m(curated.id, curated.name), promptUsdPerM: 9 }] })
    const out = await listLlmModels(d)
    expect(out[0]!.id).toBe(curated.id)
    expect(out[0]!.promptUsdPerM).toBe(9)
    expect(out.slice(-2).map(x => x.id)).toEqual(['a/alpha', 'z/zed'])
    expect(writes).toHaveLength(1)
  })
  it('serves a fresh cache without fetching, and refetches after 24 h', async () => {
    const fresh = deps({ cache: { at: 1_000_000 - 3600_000, models: [m('c/cached')] } })
    expect((await listLlmModels(fresh.d)).map(x => x.id)).toContain('c/cached')
    expect(fresh.fetches()).toBe(0)
    const stale = deps({ cache: { at: 1_000_000 - 25 * 3600_000, models: [m('c/cached')] } })
    expect((await listLlmModels(stale.d)).map(x => x.id)).toContain('a/alpha')
    expect(stale.fetches()).toBe(1)
  })
  it('falls back to a stale cache, then to the curated list, when offline', async () => {
    const offline = async (): Promise<LlmModelInfo[]> => { throw new Error('offline') }
    expect((await listLlmModels(deps({ fetchModels: offline, cache: { at: 0, models: [m('c/old')] } }).d)).map(x => x.id)).toContain('c/old')
    expect(await listLlmModels(deps({ fetchModels: offline }).d)).toEqual(curatedModels())
  })
  it('curated models carry bundled prices', () => {
    expect(curatedModels().length).toBeGreaterThanOrEqual(8)
    expect(curatedModels().every(x => x.promptUsdPerM !== null && x.completionUsdPerM !== null)).toBe(true)
  })
})

describe('testLlmModel', () => {
  const prov = (gen: () => AsyncGenerator<{ delta: string }>): AnswerProvider => ({ id: 'openrouter', stream: () => gen() })
  it('reports time to first token', async () => {
    let t = 100
    const r = await testLlmModel(prov(async function* () { t += 340; yield { delta: 'OK' } }), 'a/b', () => t)
    expect(r).toEqual({ ok: true, firstTokenMs: 340 })
  })
  it('reports a readable failure', async () => {
    expect(await testLlmModel(prov(async function* () { throw new LlmError('auth', 'Invalid key'); yield { delta: '' } }), 'a/b')).toEqual({ ok: false, firstTokenMs: null, message: 'Invalid key' })
    expect(await testLlmModel(prov(async function* () { throw new Error('socket hang up'); yield { delta: '' } }), 'a/b')).toMatchObject({ ok: false, message: 'Could not reach the model' })
    expect(await testLlmModel(prov(async function* () { yield { delta: '' } }), 'a/b')).toMatchObject({ ok: false, message: 'The model returned no text' })
  })
})
