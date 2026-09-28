// OpenCode: the `opencode` CLI runner's inline config (permissions, browser MCP) and the
// OpenCode Zen model list shared with the in-process `zen` runner (zen-agent.ts).
import type { McpServer } from './integrations/browser-args'

export const ZEN_URL = 'https://opencode.ai/zen/v1'
export const ZEN_KEYS = 'https://opencode.ai/auth'
export const NEEDS_ZEN_KEY = 'Add your OpenCode Zen API key in Settings → API keys to use OpenCode Zen (free models stay free with a key)'

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
    },
  })
}

/** Browser boards: the only tools are the named MCP server's read-only browser tools. */
export function opencodeBrowserConfig(name: string, mcp: McpServer, tools: readonly string[]): string {
  return JSON.stringify({
    mcp: { [name]: { type: 'local', command: [mcp.command, ...mcp.args], enabled: true, timeout: 120_000 } },
    // Later rules win: deny every tool, then allow the read-only browser ones.
    permission: { '*': 'deny', ...Object.fromEntries(tools.map(t => [`${name}_${t}`, 'allow'])) },
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
export type ZenModel = { id: string; label: string; free: boolean }

/** Catalogue JSON → models the zen runner can drive: tool calling, chat/completions, not alpha
 *  or deprecated; free first. Pure (tested). */
export function zenModelsFrom(catalogue: unknown): ZenModel[] {
  const provider = (catalogue as { opencode?: { npm?: string; models?: Record<string, CatalogueModel> } } | null)?.opencode
  const out = Object.entries(provider?.models ?? {}).flatMap(([key, m]) => {
    const id = m.id ?? key
    const npm = m.provider?.npm ?? provider?.npm
    if (!m.tool_call || m.status === 'alpha' || m.status === 'deprecated' || npm !== CHAT_NPM || !/^[\w.:@-]{1,100}$/.test(id)) return []
    const free = m.cost?.input === 0
    return [{ id, free, label: `${m.name ?? id}${free ? ' (free)' : ''}` }]
  })
  const rank = (m: ZenModel) => (m.free ? 0 : 2) + (PREFERRED.includes(m.id) ? 0 : 1)
  return out.sort((a, b) => rank(a) - rank(b) || a.id.localeCompare(b.id))
}

let cached: { at: number; models: ZenModel[] } | null = null
export async function zenModels(): Promise<ZenModel[]> {
  if (cached && Date.now() - cached.at < 3_600_000) return cached.models
  const res = await fetch(ZEN_CATALOGUE, { signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`OpenCode model catalogue: HTTP ${res.status}`)
  cached = { at: Date.now(), models: zenModelsFrom(await res.json()) }
  return cached.models
}

/** The user's pick, else the catalogue's first free model (free models rotate, so never hardcoded). */
export async function zenModel(chosen: string | undefined): Promise<string> {
  if (chosen) return chosen
  const first = (await zenModels())[0]
  if (!first) throw new Error('No OpenCode Zen model is available right now — pick one in Settings')
  return first.id
}
