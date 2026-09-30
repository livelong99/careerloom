// Wires the pure WP2 modules to the running app: the OpenRouter key from safeStorage, copilot.json, and the on-disk model cache.
import fs from 'node:fs'

import { readApiKey, userFile } from '../context'
import { readCopilotConfig } from './config'
import { listLlmModels, testLlmModel, type ModelListDeps } from './models'
import { createOpenRouter, fetchModels } from './providers/openrouter'
import type { AnswerProvider } from './engine'
import { e2eHooks } from './e2e-hooks'

export const liveProvider = (): AnswerProvider => {
  const e2e = e2eHooks()
  return createOpenRouter({ getKey: e2e ? () => 'e2e-key' : readApiKey, config: () => readCopilotConfig().engine.openrouter, baseUrl: e2e?.baseUrl })
}

const cacheFile = () => userFile('copilot-llm-models.json')
const liveModelDeps = (): ModelListDeps => ({
  fetchModels: () => fetchModels(fetch, e2eHooks()?.baseUrl),
  readCache: () => { try { return JSON.parse(fs.readFileSync(cacheFile(), 'utf8')) } catch { return null } },
  writeCache: c => { try { fs.writeFileSync(cacheFile(), JSON.stringify(c)) } catch { /* cache is an optimisation */ } },
})

export const listLiveModels = () => listLlmModels(liveModelDeps())
export const testLiveModel = (id: string) => testLlmModel(liveProvider(), id)
