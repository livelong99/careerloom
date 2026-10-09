// Connection tests: the cheapest call each provider offers (a key lookup or a model list) — no tokens
// are spent. Results carry a fixed message only; neither the key nor a raw error ever goes into them.
import { readSecret, readSettings } from '../context'
import { authHeaders, isProviderId, PROVIDERS } from '../llm/providers'
import { parseBaseUrl } from '../integrations/firecrawl-client'
import { readRegistry } from '../integrations/registry'
import { ZEN_URL } from '../opencode'
import { recordTest, secretName } from './keys'
import type { KeyId, KeyTest } from './types'

export const TEST_TIMEOUT_MS = 8_000
const BRAVE_PROBE = 'https://api.search.brave.com/res/v1/web/search?q=test&count=1' // one result: the cheapest billable call
const OPENROUTER_AUTH = 'https://openrouter.ai/api/v1/auth/key'

export type KeyTestDeps = { fetch?: typeof fetch; now?: () => number }

const inFlight = new Map<KeyId, Promise<KeyTest>>()

const httpDetail = (status: number, label: string): string => {
  if (status === 401 || status === 403) return `Invalid key — ${label} rejected it`
  if (status === 402) return `${label} says the account is out of credit`
  if (status === 429) return `${label} rate limit reached — try again shortly`
  return `${label} answered HTTP ${status}`
}

async function probe(id: KeyId, f: typeof fetch): Promise<{ status: number } | null> {
  const key = readSecret(secretName(id))
  const signal = AbortSignal.timeout(TEST_TIMEOUT_MS)
  try {
    if (id === 'openrouter') return { status: (await f(OPENROUTER_AUTH, { headers: { authorization: `Bearer ${key}` }, signal })).status } // /models is public: /auth/key is the one that checks the key
    if (isProviderId(id)) {
      const def = PROVIDERS[id]
      const base = def.baseUrl ?? readSettings().llm.customBaseUrl
      if (!base) return null
      return { status: (await f(`${base}${def.modelsPath}`, { headers: authHeaders(id, key), signal })).status }
    }
    if (id === 'brave') return { status: (await f(BRAVE_PROBE, { headers: { 'x-subscription-token': key ?? '', accept: 'application/json' }, signal })).status }
    if (id === 'opencode') return { status: (await f(`${ZEN_URL}/models`, { headers: { authorization: `Bearer ${key}` }, signal })).status }
    const url = parseBaseUrl(readRegistry().firecrawl.url).toString()
    return { status: (await f(url, { headers: key ? { authorization: `Bearer ${key}` } : {}, signal })).status }
  } catch { return null }
}

const TOOL_LABEL = { opencode: 'OpenCode Zen', firecrawl: 'Firecrawl', brave: 'Brave Search', exa: 'Exa', serper: 'Serper' } as const
const labelOf = (id: KeyId): string => (isProviderId(id) ? PROVIDERS[id].label : TOOL_LABEL[id])

const SEARCH_IDS: ReadonlySet<KeyId> = new Set(['exa', 'serper']) // ponytail: fallbacks, test call added with their adapters

/** One test per provider at a time; a second click joins the running one. */
export function testKey(id: KeyId, deps: KeyTestDeps = {}): Promise<KeyTest> {
  const running = inFlight.get(id)
  if (running) return running
  const run = (async (): Promise<KeyTest> => {
    if (id !== 'firecrawl' && !(id === 'custom') && readSecret(secretName(id)) === null) throw new Error(`Add a key first — no ${labelOf(id)} key is saved`)
    if (SEARCH_IDS.has(id)) throw new Error(`The ${labelOf(id)} connection test arrives with its search adapter`)
    const now = deps.now ?? Date.now
    const started = now()
    const res = await probe(id, deps.fetch ?? globalThis.fetch)
    const at = now()
    const ok = res !== null && res.status >= 200 && res.status < 300
    const detail = res === null ? `Could not reach ${labelOf(id)}${id === 'firecrawl' ? ' — is it running? Start it in Integrations' : ''}` : ok ? 'Key accepted' : httpDetail(res.status, labelOf(id))
    return recordTest(id, { ok, latencyMs: res === null ? null : at - started, detail: id === 'firecrawl' && ok ? 'Firecrawl is reachable' : detail, at })
  })().finally(() => inFlight.delete(id))
  inFlight.set(id, run)
  return run
}
