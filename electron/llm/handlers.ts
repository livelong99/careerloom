// IPC for the per-feature model assignments (registered in main.ts as `careerloom:<name>`).
import { broadcast, readSecret, readSettings, userFile, writeSettings, type Handler } from '../context'
import { fetchModels } from '../copilot/providers/openrouter'
import type { LlmModelInfo } from '../copilot/types'
import { cacheFileDeps, fetchProviderModels, listProviderModels } from './models'
import { isProviderId, PROVIDER_IDS, PROVIDERS, type ProviderId } from './providers'
import { applyLlmPatch, type LlmSettings } from './settings'
import type { ProviderRow } from '../settings/types'

export const llmProviderRows = (): ProviderRow[] => {
  const base = readSettings().llm.customBaseUrl
  return PROVIDER_IDS.map(id => ({ id, label: PROVIDERS[id].label, hasKey: readSecret(id) !== null, keyOptional: PROVIDERS[id].keyOptional, needsBaseUrl: PROVIDERS[id].baseUrl === null && !base }))
}

/** Every model the provider lists (any feature but the Copilot may use them). Cached 24 h per provider. */
export async function llmModels(id: ProviderId): Promise<LlmModelInfo[]> {
  const def = PROVIDERS[id]
  const baseUrl = def.baseUrl ?? readSettings().llm.customBaseUrl
  if (!baseUrl) throw new Error(`Set the address of your ${def.label} server first`)
  return listProviderModels({
    ...cacheFileDeps(userFile(`llm-models-${id}.json`)),
    fetchModels: () => (id === 'openrouter' ? fetchModels() : fetchProviderModels(id, baseUrl, readSecret(id))),
  })
}

export const llmHandlers: Record<string, Handler> = {
  llmProviders: (): ProviderRow[] => llmProviderRows(),
  llmSet: (patch: unknown): LlmSettings => {
    const llm = writeSettings({ llm: applyLlmPatch(readSettings().llm, patch) }).llm
    broadcast('careerloom:settings', null)
    return llm
  },
  llmModels: (id: unknown): Promise<LlmModelInfo[]> => {
    if (!isProviderId(id)) return Promise.reject(new Error('Unknown provider'))
    return llmModels(id)
  },
}
