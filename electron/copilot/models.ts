// The answer-model picker's data (plan §4 copilotListLlmModels / copilotTestLlmModel). Pure: I/O is injected so it tests without Electron.
import recommended from './recommended-models.json'
import { defaultPrices } from './cost'
import type { AnswerProvider } from './engine'
import { friendlyLlmError } from './providers/errors'
import { LlmError } from './providers/openrouter'
import type { ErrorAction, LlmModelInfo } from './types'

const DAY = 24 * 3600 * 1000
type Cache = { at: number; models: LlmModelInfo[] }
export type ModelListDeps = {
  fetchModels(): Promise<LlmModelInfo[]>
  readCache(): Cache | null
  writeCache(c: Cache): void
  /** Per-model result of the last Test under the deny policy: the only way to learn a paid model's real policy fit. */
  readProbes?(): Record<string, 'ok' | 'policy'>
  now?: () => number
}

/** The dated bundled list, used when offline and as the top of the picker. */
export function curatedModels(): LlmModelInfo[] {
  const seen = new Set<string>()
  return Object.values(recommended.tiers).flat().filter(m => !seen.has(m.id) && seen.add(m.id)).map(m => ({
    id: m.id, name: m.name, contextTokens: m.contextTokens, promptUsdPerM: defaultPrices.models[m.id]?.promptUsdPerM ?? null,
    completionUsdPerM: defaultPrices.models[m.id]?.completionUsdPerM ?? null, dataPolicy: 'unknown' as const, supportsStreaming: true,
  }))
}

/** Curated first, then the rest by name. Cached 24 h; stale cache, then the curated list, when the network fails. */
export async function listLlmModels(deps: ModelListDeps): Promise<LlmModelInfo[]> {
  const now = (deps.now ?? Date.now)()
  const cached = deps.readCache()
  const probes = deps.readProbes?.() ?? {}
  const withProbe = (m: LlmModelInfo): LlmModelInfo =>
    m.dataPolicy === 'may-collect' || !probes[m.id] ? m : { ...m, dataPolicy: probes[m.id] === 'policy' ? 'may-collect' : 'no-collect' }
  const order = (all: LlmModelInfo[]) => {
    const top = curatedModels()
    const ids = new Set(top.map(m => m.id))
    const live = new Map(all.map(m => [m.id, m]))
    return [...top.map(m => live.get(m.id) ?? m), ...all.filter(m => !ids.has(m.id)).sort((a, b) => a.name.localeCompare(b.name))].map(withProbe)
  }
  if (cached && now - cached.at < DAY) return order(cached.models)
  try {
    const models = await deps.fetchModels()
    deps.writeCache({ at: now, models })
    return order(models)
  } catch {
    return cached ? order(cached.models) : curatedModels()
  }
}

export type TestResult = { firstTokenMs: number | null; ok: boolean; message?: string; code?: string; actions?: ErrorAction[] }

/** One tiny streamed call: reports time to first token or why it failed. Costs a fraction of a cent. */
export async function testLlmModel(provider: AnswerProvider, model: string, ctx: { dataCollection: 'deny' | 'allow' } = { dataCollection: 'deny' }, now: () => number = Date.now): Promise<TestResult> {
  const ac = new AbortController()
  const start = now()
  let first: number | null = null
  try {
    let gotText = false
    const it = provider.stream({ system: 'Reply with the single word OK.', messages: [{ role: 'user', content: 'ping' }], model, signal: AbortSignal.any([ac.signal, AbortSignal.timeout(20_000)]), maxTokens: 8 })
    for await (const item of it) if ('delta' in item && item.delta) { first ??= now() - start; gotText = true; ac.abort(); break }
    return gotText ? { ok: true, firstTokenMs: first } : { ok: false, firstTokenMs: null, message: 'The model returned no text' }
  } catch (e) {
    if (first !== null) return { ok: true, firstTokenMs: first }
    const f = friendlyLlmError(e, ctx)
    return { ok: false, firstTokenMs: null, message: f.message, ...(f.code ? { code: f.code } : {}), actions: f.actions }
  }
}
