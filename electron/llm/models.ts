// Model lists for the non-OpenRouter providers: GET <base>/models, cached 24 h per provider, never including the key in a result.
import fs from 'node:fs'

import type { LlmModelInfo } from '../copilot/types'
import { authHeaders, PROVIDERS, type ProviderId } from './providers'

const DAY = 24 * 3600 * 1000

export const modelInfo = (id: string, name = id): LlmModelInfo => ({ id, name, contextTokens: null, promptUsdPerM: null, completionUsdPerM: null, dataPolicy: 'unknown', supportsStreaming: true })

/** Accepts `{data:[{id}]}` (OpenAI and most), a bare array (Together) and Google's `models/` id prefix; chat-capable filtering is left to the vendor. */
export function parseModelList(json: unknown): LlmModelInfo[] {
  const rows = Array.isArray(json) ? json : (json as { data?: unknown } | null)?.data
  if (!Array.isArray(rows)) return []
  const seen = new Set<string>()
  const out: LlmModelInfo[] = []
  for (const r of rows) {
    const raw = (r as { id?: unknown })?.id
    if (typeof raw !== 'string') continue
    const id = raw.replace(/^models\//, '')
    if (!id || seen.has(id)) continue
    seen.add(id)
    out.push(modelInfo(id))
  }
  return out.sort((a, b) => a.id.localeCompare(b.id))
}

export async function fetchProviderModels(provider: ProviderId, baseUrl: string, key: string | null, f: typeof fetch = fetch): Promise<LlmModelInfo[]> {
  const res = await f(`${baseUrl}${PROVIDERS[provider].modelsPath}`, { headers: authHeaders(provider, key), signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new Error(`${PROVIDERS[provider].label} answered HTTP ${res.status}`)
  return parseModelList(await res.json())
}

type Cache = { at: number; models: LlmModelInfo[] }
export type ProviderModelDeps = { fetchModels(): Promise<LlmModelInfo[]>; readCache(): Cache | null; writeCache(c: Cache): void; now?: () => number }

/** Cached 24 h; a failed refresh serves the stale list, and with no cache the error reaches the caller (the UI offers a typed id then). */
export async function listProviderModels(d: ProviderModelDeps): Promise<LlmModelInfo[]> {
  const now = (d.now ?? Date.now)()
  const cached = d.readCache()
  if (cached && now - cached.at < DAY) return cached.models
  try {
    const models = await d.fetchModels()
    d.writeCache({ at: now, models })
    return models
  } catch (e) {
    if (cached) return cached.models
    throw e
  }
}

export const cacheFileDeps = (file: string): Pick<ProviderModelDeps, 'readCache' | 'writeCache'> => ({
  readCache: () => { try { return JSON.parse(fs.readFileSync(file, 'utf8')) as Cache } catch { return null } },
  writeCache: c => { try { fs.writeFileSync(file, JSON.stringify(c)) } catch { /* cache is an optimisation */ } },
})
