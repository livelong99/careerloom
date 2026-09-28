// OpenCode: the `opencode` CLI runner's inline config (permissions, browser MCP) and the
// OpenCode Zen model list shared with the in-process `zen` runner (zen-agent.ts).
import type { McpServer } from './integrations/browser-args'

export const ZEN_URL = 'https://opencode.ai/zen/v1'
export const ZEN_KEYS = 'https://opencode.ai/auth'
export const NEEDS_ZEN_KEY = 'Add your OpenCode Zen API key in Settings → API keys to use OpenCode Zen (paid models) — for free models, use the OpenCode (CLI) runner, no key needed'

/** Headless `opencode run` auto-rejects anything set to "ask", so this is the whole grant:
 *  file tools inside the folder (plus installed skills), career-ops' own node / npm
 *  scripts, web fetch + search. Mirrors CLAUDE_TOOLS in runner.ts. */
export function opencodeConfig(skillDirs: string[]): string {
  return JSON.stringify({
    permission: {
      edit: 'allow',
      bash: { '*': 'deny', 'node *': 'allow', 'npm run *': 'allow' },
      webfetch: 'allow',
      websearch: 'allow',
      external_directory: Object.fromEntries(skillDirs.map(d => [`${d.replace(/[\\/]+$/, '')}/**`, 'allow'])),
      skill: skillAllowlist(skillDirs),
    },
  })
}

/** opencode lists every skill it can find (~/.agents/skills, ~/.config/opencode/skills…) in each request —
 *  1.5k skills measured at ~130k input tokens. Denied skills drop out of that list, so allow only
 *  career-ops' own and the skills installed in Careerloom (155k → 22k input tokens per run). */
export function skillAllowlist(skillDirs: string[]): Record<string, 'allow' | 'deny'> {
  const names = skillDirs.map(d => d.replace(/[\\/]+$/, '').split(/[\\/]/).pop()!).filter(n => /^[\w.-]{1,80}$/.test(n))
  return { '*': 'deny', 'career-ops*': 'allow', ...Object.fromEntries(names.map(n => [`${n}*`, 'allow' as const])) }
}

/** Browser boards: the only tools are the named MCP server's read-only browser tools. */
export function opencodeBrowserConfig(name: string, mcp: McpServer, tools: readonly string[]): string {
  return JSON.stringify({
    mcp: { [name]: { type: 'local', command: [mcp.command, ...mcp.args], enabled: true, timeout: 120_000 } },
    // "ask" (auto-rejected headless), not "deny": a denied tool is dropped from the request, and Zen's free
    // tier refuses requests without opencode's standard tools (FreeTierError). Later rules win.
    permission: { '*': 'ask', skill: 'deny', ...Object.fromEntries(tools.map(t => [`${name}_${t}`, 'allow'])) },
  })
}

/** Env for every opencode spawn. With a key, headless runs are authenticated: Zen serves its keyless
 *  free tier only inside OpenCode's own app, and the key also unlocks paid models. */
export function opencodeEnv(config: string, key: string | null): NodeJS.ProcessEnv {
  return { OPENCODE_CONFIG_CONTENT: config, OPENCODE_DISABLE_AUTOUPDATE: '1', ...(key ? { OPENCODE_API_KEY: key } : {}) }
}

// ————— OpenCode Zen model catalogue —————
// The same catalogue the opencode CLI reads: per-model price, status and API package. Zen's own
// /models lists ids only, including ones a given account can't use.
export const ZEN_CATALOGUE = 'https://models.opencode.ai/api.json'
const CHAT_NPM = '@ai-sdk/openai-compatible' // served on /chat/completions, the only endpoint the zen runner speaks
/** opencode's own preference order for defaults (provider.ts `priority`). */
const PREFERRED = ['big-pickle']

type CatalogueModel = { id?: string; name?: string; tool_call?: boolean; status?: string; cost?: { input?: number }; provider?: { npm?: string } }
export type ZenModel = { id: string; label: string; free: boolean; price: number }

/** Catalogue JSON → models the zen runner can drive: tool calling, chat/completions, not alpha
 *  or deprecated; free first. Pure (tested). */
export function zenModelsFrom(catalogue: unknown): ZenModel[] {
  const provider = (catalogue as { opencode?: { npm?: string; models?: Record<string, CatalogueModel> } } | null)?.opencode
  const out = Object.entries(provider?.models ?? {}).flatMap(([key, m]) => {
    const id = m.id ?? key
    const npm = m.provider?.npm ?? provider?.npm
    if (!m.tool_call || m.status === 'alpha' || m.status === 'deprecated' || npm !== CHAT_NPM || !/^[\w.:@-]{1,100}$/.test(id)) return []
    const free = m.cost?.input === 0
    return [{ id, free, price: m.cost?.input ?? 0, label: `${m.name ?? id}${free ? ' (free)' : ''}` }]
  })
  const rank = (m: ZenModel) => (m.free ? 0 : 2) + (PREFERRED.includes(m.id) ? 0 : 1)
  return out.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))
}

let cached: { at: number; models: ZenModel[] } | null = null
async function catalogue(): Promise<ZenModel[]> {
  if (cached && Date.now() - cached.at < 3_600_000) return cached.models
  const res = await fetch(ZEN_CATALOGUE, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`OpenCode model catalogue: HTTP ${res.status}`)
  cached = { at: Date.now(), models: zenModelsFrom(await res.json()) }
  return cached.models
}

export const FREE_ON_API = 'OpenCode Zen serves free models only inside the OpenCode app, not over its API — switch the runner to OpenCode (CLI), which runs the same free models, or pick a paid model for OpenCode Zen in Settings'

/** Models the zen (API) runner can use: paid only — Zen answers free models over the API with
 *  FreeTierError whatever the key. Cheapest first, so the default is the cheapest. */
export async function zenModels(): Promise<ZenModel[]> {
  return paidCheapestFirst(await catalogue())
}
export const paidCheapestFirst = (models: ZenModel[]): ZenModel[] => models.filter(m => !m.free).sort((a, b) => a.price - b.price || a.id.localeCompare(b.id))

export const isFreeModel = (id: string, models: ZenModel[]): boolean => models.find(m => m.id === id)?.free ?? /-free$/.test(id)

/** The user's pick, else the cheapest paid model. A free pick fails here, before any request. */
export async function zenModel(chosen: string | undefined): Promise<string> {
  const all = await catalogue().catch(() => [] as ZenModel[])
  if (chosen && isFreeModel(chosen, all)) throw new Error(FREE_ON_API)
  if (chosen) return chosen
  const first = paidCheapestFirst(all)[0]
  if (!first) throw new Error('No paid OpenCode Zen model is available right now — pick one in Settings, or use the OpenCode (CLI) runner for free models')
  return first.id
}
