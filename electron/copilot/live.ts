// Wires the pure WP2 modules to the running app: the OpenRouter key from safeStorage, copilot.json, and the on-disk model cache.
import fs from 'node:fs'

import { readApiKey, userFile } from '../context'
import { readCopilotConfig } from './config'
import { listLlmModels, testLlmModel, type ModelListDeps } from './models'
import { createOpenRouter, fetchModels } from './providers/openrouter'
import type { AnswerProvider } from './engine'

export const liveProvider = (): AnswerProvider => createOpenRouter({ getKey: readApiKey, config: () => readCopilotConfig().engine.openrouter })

const cacheFile = () => userFile('copilot-llm-models.json')
const liveModelDeps = (): ModelListDeps => ({
  fetchModels: () => fetchModels(),
  readCache: () => { try { return JSON.parse(fs.readFileSync(cacheFile(), 'utf8')) } catch { return null } },
  writeCache: c => { try { fs.writeFileSync(cacheFile(), JSON.stringify(c)) } catch { /* cache is an optimisation */ } },
})

export const listLiveModels = () => listLlmModels(liveModelDeps())
export const testLiveModel = (id: string) => testLlmModel(liveProvider(), id)
