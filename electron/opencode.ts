// OpenCode: the `opencode` CLI runner's inline config (permissions, browser MCP) and the
// OpenCode Zen model list shared with the in-process `zen` runner (zen-agent.ts).
import type { McpServer } from './integrations/browser-args'

export const ZEN_URL = 'https://opencode.ai/zen/v1'
/** Zen serves its free models without a key; the CLI sends this same placeholder. */
export const zenAuth = (key: string | null) => `Bearer ${key ?? 'public'}`

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

/** Env for every opencode spawn. The key (optional) unlocks paid Zen models. */
export function opencodeEnv(config: string, key: string | null): NodeJS.ProcessEnv {
  return { OPENCODE_CONFIG_CONTENT: config, OPENCODE_DISABLE_AUTOUPDATE: '1', ...(key ? { OPENCODE_API_KEY: key } : {}) }
}

// Zen routes GPT/Grok to /responses, Claude/most Qwen to /messages and Gemini to its own
// endpoint; the zen runner speaks /chat/completions only.
// ponytail: prefix filter, add the other endpoints when a user needs those models over the API.
const NOT_CHAT = /^(gpt|o\d|claude|gemini|grok|qwen|muse|jev)/i
/** Used until the user picks one; free, listed on Zen's free tier (limited-time). */
export const ZEN_DEFAULT_MODEL = 'big-pickle'
export const isFreeZenModel = (id: string) => /-free$|^big-pickle$/.test(id)

/** `GET /models` → ids the zen runner can drive, free ones first. */
export async function zenModels(key: string | null): Promise<Array<{ id: string; label: string }>> {
  const res = await fetch(`${ZEN_URL}/models`, { headers: { authorization: zenAuth(key) }, signal: AbortSignal.timeout(15_000) })
  if (!res.ok) throw new Error(`OpenCode Zen models: HTTP ${res.status}`)
  const body = (await res.json()) as { data?: Array<{ id?: unknown }> }
  const ids = (body.data ?? []).map(m => m.id).filter((id): id is string => typeof id === 'string' && !NOT_CHAT.test(id))
  return ids.sort((a, b) => Number(isFreeZenModel(b)) - Number(isFreeZenModel(a))).map(id => ({ id, label: isFreeZenModel(id) ? `${id} (free)` : id }))
}
