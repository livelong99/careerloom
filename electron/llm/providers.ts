// Registry of OpenAI-compatible LLM providers the user can bring a key for. Pure data + helpers (no Electron),
// so the renderer-facing lists, the key manager and the stream adapter all read one table.
// Base URLs checked against each vendor's official OpenAI-compatibility docs on 2026-10-09.

export const PROVIDER_IDS = ['openrouter', 'openai', 'anthropic', 'google', 'groq', 'mistral', 'deepseek', 'xai', 'together', 'fireworks', 'cerebras', 'custom'] as const
export type ProviderId = (typeof PROVIDER_IDS)[number]

export type ProviderDef = {
  id: ProviderId
  label: string
  /** `custom` has none: the user supplies it (see validateCustomBaseUrl). */
  baseUrl: string | null
  /** Path (under baseUrl) of the model list. */
  modelsPath: string
  keyFormatHint: string
  helpUrl: string | null
  /** Curated low-latency models: the only ones the Copilot may use. Ids drift, so the picker also shows a typed-in id only for `custom`. */
  fastModels: string[]
  /** The key is optional (local servers such as Ollama / LM Studio). */
  keyOptional: boolean
  /** Sends `stream_options.include_usage` (OpenRouter has its own `usage` flag; Mistral streams usage unasked). */
  streamUsage: boolean
  /** Newer OpenAI models reject `max_tokens`. */
  maxTokensField: 'max_tokens' | 'max_completion_tokens'
  /** Extra auth headers beyond `Authorization: Bearer`. */
  extraAuth?: (key: string) => Record<string, string>
  /** Omit `temperature` (rejected by some models). */
  noTemperature?: boolean
  /** Key shape check beyond "non-empty, no spaces"; only where the vendor documents a prefix. */
  prefix?: RegExp
}

const p = (d: Omit<ProviderDef, 'keyOptional' | 'streamUsage' | 'maxTokensField'> & Partial<Pick<ProviderDef, 'keyOptional' | 'streamUsage' | 'maxTokensField'>>): ProviderDef =>
  ({ keyOptional: false, streamUsage: true, maxTokensField: 'max_tokens', ...d })

export const PROVIDERS: Record<ProviderId, ProviderDef> = {
  // OpenRouter's fast set is the 'fast' tier of copilot/recommended-models.json (see fastModelsFor).
  openrouter: p({ id: 'openrouter', label: 'OpenRouter', baseUrl: 'https://openrouter.ai/api/v1', modelsPath: '/models', keyFormatHint: 'Starts with sk-or-', helpUrl: 'https://openrouter.ai/keys', fastModels: [], streamUsage: false, prefix: /^sk-or-[\w-]{10,}$/ }),
  openai: p({ id: 'openai', label: 'OpenAI', baseUrl: 'https://api.openai.com/v1', modelsPath: '/models', keyFormatHint: 'Starts with sk-', helpUrl: 'https://platform.openai.com/api-keys', fastModels: ['gpt-4.1-nano', 'gpt-4.1-mini'], maxTokensField: 'max_completion_tokens' }),
  anthropic: p({ id: 'anthropic', label: 'Anthropic', baseUrl: 'https://api.anthropic.com/v1', modelsPath: '/models', keyFormatHint: 'Starts with sk-ant-', helpUrl: 'https://platform.claude.com/settings/keys', fastModels: ['claude-haiku-4-5'], extraAuth: k => ({ 'x-api-key': k, 'anthropic-version': '2023-06-01' }), noTemperature: true, prefix: /^sk-ant-[\w-]{10,}$/ }),
  google: p({ id: 'google', label: 'Google Gemini', baseUrl: 'https://generativelanguage.googleapis.com/v1beta/openai', modelsPath: '/models', keyFormatHint: 'Starts with AIza', helpUrl: 'https://aistudio.google.com/apikey', fastModels: ['gemini-2.5-flash-lite', 'gemini-2.5-flash'] }),
  groq: p({ id: 'groq', label: 'Groq', baseUrl: 'https://api.groq.com/openai/v1', modelsPath: '/models', keyFormatHint: 'Starts with gsk_', helpUrl: 'https://console.groq.com/keys', fastModels: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'], prefix: /^gsk_[\w-]{10,}$/ }),
  mistral: p({ id: 'mistral', label: 'Mistral', baseUrl: 'https://api.mistral.ai/v1', modelsPath: '/models', keyFormatHint: 'Letters and digits, 20+ characters', helpUrl: 'https://console.mistral.ai/api-keys', fastModels: ['ministral-8b-latest', 'mistral-small-latest'], streamUsage: false }),
  deepseek: p({ id: 'deepseek', label: 'DeepSeek', baseUrl: 'https://api.deepseek.com/v1', modelsPath: '/models', keyFormatHint: 'Starts with sk-', helpUrl: 'https://platform.deepseek.com/api_keys', fastModels: ['deepseek-chat'] }),
  xai: p({ id: 'xai', label: 'xAI', baseUrl: 'https://api.x.ai/v1', modelsPath: '/models', keyFormatHint: 'Starts with xai-', helpUrl: 'https://console.x.ai', fastModels: ['grok-3-mini'], prefix: /^xai-[\w-]{10,}$/ }),
  together: p({ id: 'together', label: 'Together AI', baseUrl: 'https://api.together.ai/v1', modelsPath: '/models', keyFormatHint: '40+ hex characters', helpUrl: 'https://api.together.ai/settings/api-keys', fastModels: ['meta-llama/Llama-3.1-8B-Instruct-Turbo'] }),
  fireworks: p({ id: 'fireworks', label: 'Fireworks AI', baseUrl: 'https://api.fireworks.ai/inference/v1', modelsPath: '/models', keyFormatHint: 'Starts with fw_', helpUrl: 'https://fireworks.ai/account/api-keys', fastModels: ['accounts/fireworks/models/llama-v3p1-8b-instruct'] }),
  cerebras: p({ id: 'cerebras', label: 'Cerebras', baseUrl: 'https://api.cerebras.ai/v1', modelsPath: '/models', keyFormatHint: 'Starts with csk-', helpUrl: 'https://cloud.cerebras.ai', fastModels: ['llama3.1-8b'], prefix: /^csk-[\w-]{10,}$/ }),
  custom: p({ id: 'custom', label: 'Custom (Ollama, LM Studio, vLLM…)', baseUrl: null, modelsPath: '/models', keyFormatHint: 'Optional — only if your server checks one', helpUrl: null, fastModels: [], keyOptional: true, streamUsage: false }),
}

export const isProviderId = (v: unknown): v is ProviderId => typeof v === 'string' && (PROVIDER_IDS as readonly string[]).includes(v)

/** Loose check shared by every provider; a documented prefix is enforced where the vendor publishes one. */
export function validateProviderKey(id: ProviderId, value: string): void {
  const d = PROVIDERS[id]
  if (!/^\S{8,300}$/.test(value) || (d.prefix && !d.prefix.test(value))) throw new Error(`That does not look like a ${d.label} key — ${d.keyFormatHint.toLowerCase()}`)
}

const LOOPBACK = /^(localhost|127\.\d+\.\d+\.\d+|\[::1\])$/

/** https anywhere, plain http only on loopback (a local Ollama / LM Studio). Returns the URL without a trailing slash, or throws. */
export function validateCustomBaseUrl(raw: unknown): string {
  if (typeof raw !== 'string' || raw.length > 300) throw new Error('Enter the server address, e.g. http://localhost:11434/v1')
  let u: URL
  try { u = new URL(raw.trim()) } catch { throw new Error('That is not a valid URL') }
  if (u.username || u.password || u.search || u.hash) throw new Error('Remove credentials, query and fragment from the address')
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && LOOPBACK.test(u.hostname))) throw new Error('Use https://, or http:// only for localhost')
  return u.toString().replace(/\/+$/, '')
}

/** Models the Copilot may use for this provider. OpenRouter: the caller passes its curated fast tier. `null` = any (custom: the user knows their own server). */
export function fastModelsFor(id: ProviderId, openrouterFast: readonly string[]): readonly string[] | null {
  if (id === 'custom') return null
  return id === 'openrouter' ? openrouterFast : PROVIDERS[id].fastModels
}

export const isFastModel = (id: ProviderId, model: string, openrouterFast: readonly string[]): boolean => {
  const fast = fastModelsFor(id, openrouterFast)
  return fast === null || fast.includes(model)
}

/** Headers for an authenticated call; the key is optional only for `custom`. */
export function authHeaders(id: ProviderId, key: string | null): Record<string, string> {
  if (!key) return {}
  return { Authorization: `Bearer ${key}`, ...PROVIDERS[id].extraAuth?.(key) }
}
