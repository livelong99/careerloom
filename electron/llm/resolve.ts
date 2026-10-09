// The one place that turns "which feature is asking" into provider + model + key. Call sites never read a key themselves.
import { readSecret, readSettings } from '../context'
import { readCopilotConfig } from '../copilot/config'
import { PROVIDERS, type ProviderDef, type ProviderId } from './providers'

export type LlmFeature = 'helper' | 'copilot'
export type ResolvedLlm = { provider: ProviderDef; baseUrl: string; model: string | null; key: string | null }

/** Friendly, actionable, never contains the key. */
export class LlmConfigError extends Error {
  override readonly name = 'LlmConfigError'
  constructor(readonly provider: ProviderId, message: string) { super(message) }
}

export type ResolveDeps = {
  secret(id: ProviderId): string | null
  assignment(feature: LlmFeature): { provider: ProviderId; model: string | null } | null
  customBaseUrl(): string | null
}

const liveDeps: ResolveDeps = {
  secret: id => readSecret(id),
  assignment: feature => {
    if (feature === 'helper') return readSettings().llm.helper
    const e = readCopilotConfig().engine
    return { provider: e.provider, model: e.models.fast }
  },
  customBaseUrl: () => readSettings().llm.customBaseUrl,
}

/** null = no provider assigned: the caller keeps using the selected runner (only `helper` can be unassigned). */
export function resolveLlm(feature: LlmFeature, deps: ResolveDeps = liveDeps): ResolvedLlm | null {
  const a = deps.assignment(feature)
  if (!a) return null
  const provider = PROVIDERS[a.provider]
  const baseUrl = provider.baseUrl ?? deps.customBaseUrl()
  if (!baseUrl) throw new LlmConfigError(a.provider, `Set the address of your ${provider.label} server in Settings › Keys`)
  const key = deps.secret(a.provider)
  if (!key && !provider.keyOptional) throw new LlmConfigError(a.provider, `Add your ${provider.label} key in Settings › Keys to use it for ${feature === 'copilot' ? 'the Interview Copilot' : 'helper calls'}`)
  return { provider, baseUrl, model: a.model, key }
}

/** Whether the feature could run right now (a key is saved, or none is needed). */
export function hasLlmKey(feature: LlmFeature, deps: ResolveDeps = liveDeps): boolean {
  try { return resolveLlm(feature, deps) !== null } catch { return false }
}
