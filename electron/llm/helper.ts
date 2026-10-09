// Direct (no agent CLI) text calls for the "helper" feature — structuring, triage, research summaries — when the user
// assigned a provider in Settings › Runners. Returns null when none is assigned, so the caller keeps using the runner.
import { createChatProvider, collectText } from '../copilot/providers/openrouter'
import { resolveLlm } from './resolve'

export type HelperResult = { text: string; inputTokens: number | null; outputTokens: number | null; model: string; usd: number | null }
const MAX_TOKENS = 4096
const TIMEOUT_MS = 120_000

export function directHelper(): ((system: string, user: string) => Promise<HelperResult>) | null {
  const r = resolveLlm('helper') // throws a friendly "add your key" error when the chosen provider has none
  if (!r) return null
  const model = r.model ?? r.provider.fastModels[0]
  if (!model) throw new Error(`Choose a model for ${r.provider.label} in Settings › Runners`)
  const provider = createChatProvider({ spec: r.provider, baseUrl: r.baseUrl, getKey: () => r.key })
  return async (system, user) => {
    const { text, usage } = await collectText(provider, { system, messages: [{ role: 'user', content: user }], model, maxTokens: MAX_TOKENS, signal: AbortSignal.timeout(TIMEOUT_MS) })
    return { text, inputTokens: usage?.promptTokens ?? null, outputTokens: usage?.completionTokens ?? null, model, usd: usage?.costUsd ?? null }
  }
}
