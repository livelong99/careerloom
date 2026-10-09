// The `llm` block of settings.json: which provider+model answers the helper calls (structuring, triage, research),
// and the address of the user's own server. The Copilot's provider/models live in copilot.json (engine.*).
import { isProviderId, validateCustomBaseUrl, type ProviderId } from './providers'

export type Assignment = { provider: ProviderId; model: string | null }
export type LlmSettings = {
  /** null = the selected runner answers (today's behaviour). */
  helper: Assignment | null
  customBaseUrl: string | null
}

export const defaultLlm = (): LlmSettings => ({ helper: null, customBaseUrl: null })

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const modelId = (v: unknown): string | null => (typeof v === 'string' && /^[\w][\w.:/@-]{0,199}$/.test(v) ? v : null)

export function normalizeLlm(raw: unknown): LlmSettings {
  const r = rec(raw)
  const h = rec(r.helper)
  let customBaseUrl: string | null = null
  try { customBaseUrl = r.customBaseUrl == null ? null : validateCustomBaseUrl(r.customBaseUrl) } catch { /* a bad stored address is dropped */ }
  return { helper: isProviderId(h.provider) ? { provider: h.provider, model: modelId(h.model) } : null, customBaseUrl }
}

/** Strict version for renderer input: bad values throw so the UI can say why. */
export function applyLlmPatch(current: LlmSettings, patch: unknown): LlmSettings {
  const p = rec(patch)
  const next = { ...current }
  if ('helper' in p) {
    if (p.helper === null) next.helper = null
    else {
      const h = rec(p.helper)
      if (!isProviderId(h.provider)) throw new Error('Unknown provider')
      if (h.model !== null && h.model !== undefined && modelId(h.model) === null) throw new Error('That model id is not valid')
      next.helper = { provider: h.provider, model: modelId(h.model) }
    }
  }
  if ('customBaseUrl' in p) next.customBaseUrl = p.customBaseUrl === null ? null : validateCustomBaseUrl(p.customBaseUrl)
  return next
}
