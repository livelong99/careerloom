// Wires the pure WP2 modules to the running app: the OpenRouter key from safeStorage, copilot.json, and the on-disk model cache.
import fs from 'node:fs'

import { userFile } from '../context'
import { cacheFileDeps, fetchProviderModels, listProviderModels, modelInfo } from '../llm/models'
import { PROVIDERS } from '../llm/providers'
import { LlmConfigError, resolveLlm } from '../llm/resolve'
import { readCopilotConfig } from './config'
import { listLlmModels, testLlmModel, type ModelListDeps } from './models'
import { createChatProvider, fetchModels, LlmError } from './providers/openrouter'
import { fastIdsFor, OPENROUTER_FAST } from './fast-models'
import type { LlmModelInfo } from './types'
import type { AnswerProvider } from './engine'
import { e2eHooks } from './e2e-hooks'
import { blockWhenLocalOnly } from './privacy-calls'

const localOnly = (): boolean => readCopilotConfig().privacy.localOnly

/** Resolves provider + key per call (Settings can change mid-session); one client per provider keeps its learned request shape. */
export const liveProvider = (): AnswerProvider => {
  const e2e = e2eHooks()
  const clients = new Map<string, AnswerProvider>()
  const inner = (): AnswerProvider => {
    if (e2e) return (clients.get('e2e') ?? clients.set('e2e', createChatProvider({ getKey: () => 'e2e-key', config: () => readCopilotConfig().engine.openrouter, baseUrl: e2e.baseUrl })).get('e2e')!)
    let r
    try { r = resolveLlm('copilot')! } catch (e) { throw e instanceof LlmConfigError ? new LlmError('no_key', e.message) : e }
    const id = `${r.provider.id}|${r.baseUrl}`
    return clients.get(id) ?? clients.set(id, createChatProvider({ spec: r.provider, baseUrl: r.baseUrl, getKey: () => resolveLlm('copilot')?.key ?? null, config: () => readCopilotConfig().engine.openrouter })).get(id)!
  }
  const wrapped: AnswerProvider = {
    get id() { return readCopilotConfig().engine.provider },
    stream: p => inner().stream(p),
    warm: async () => { try { await inner().warm?.() } catch { /* best effort */ } },
  }
  return blockWhenLocalOnly(wrapped, localOnly)
}

const cacheFile = () => userFile('copilot-llm-models.json')
const liveModelDeps = (): ModelListDeps => ({
  fetchModels: () => localOnly() ? Promise.reject(new Error('Local-only mode is on')) : fetchModels(fetch, e2eHooks()?.baseUrl), // rejection falls back to the cached/curated list
  readCache: () => { try { return JSON.parse(fs.readFileSync(cacheFile(), 'utf8')) } catch { return null } },
  writeCache: c => { try { fs.writeFileSync(cacheFile(), JSON.stringify(c)) } catch { /* cache is an optimisation */ } },
})

const probeFile = () => userFile('copilot-llm-probes.json')
const readProbes = (): Record<string, 'ok' | 'policy'> => { try { return JSON.parse(fs.readFileSync(probeFile(), 'utf8')) } catch { return {} } }

/** OpenRouter: live list + curated; own server: its /models; every other provider: its curated fast list (the Copilot accepts nothing else). */
export async function listLiveModels(): Promise<LlmModelInfo[]> {
  const { provider } = readCopilotConfig().engine
  if (provider === 'openrouter') return (await listLlmModels({ ...liveModelDeps(), readProbes })).filter(m => OPENROUTER_FAST.includes(m.id)) // fast tier only: the Copilot answers live
  if (provider === 'custom') {
    const r = resolveLlm('copilot')!
    return listProviderModels({ ...cacheFileDeps(userFile('llm-models-custom.json')), fetchModels: () => fetchProviderModels('custom', r.baseUrl, r.key) })
  }
  return (fastIdsFor(provider) ?? []).map(id => modelInfo(id))
}
export async function testLiveModel(id: string) {
  const dataCollection = readCopilotConfig().engine.openrouter.dataCollection
  const r = await testLlmModel(liveProvider(), id, { dataCollection, label: PROVIDERS[readCopilotConfig().engine.provider].label })
  // Only a deny-policy run says anything about the policy fit; remember it so the picker can badge the model.
  if (readCopilotConfig().engine.provider === 'openrouter' && dataCollection === 'deny' && (r.ok || r.code === 'policy')) {
    try { fs.writeFileSync(probeFile(), JSON.stringify({ ...readProbes(), [id]: r.ok ? 'ok' : 'policy' })) } catch { /* cache is an optimisation */ }
  }
  return r
}
