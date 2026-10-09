// Model lists for the CLI runners that have no `models` command. Codex keeps the list its own backend returned in
// ~/.codex/models_cache.json; Claude Code accepts aliases plus any full id, which Anthropic's /v1/models lists for an API key.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

export type ModelOpt = { id: string; label: string }

export const CLAUDE_ALIASES: ModelOpt[] = [
  { id: 'sonnet', label: 'Sonnet (latest)' },
  { id: 'opus', label: 'Opus (latest)' },
  { id: 'haiku', label: 'Haiku (latest, cheapest)' },
]

/** Listed models first (the CLI's own picker), then hidden ones, which still work when named. */
export function parseCodexCache(json: unknown): ModelOpt[] {
  const rows = (json as { models?: unknown } | null)?.models
  if (!Array.isArray(rows)) return []
  const ok = rows.filter((m): m is { slug: string; display_name?: string; visibility?: string } => typeof (m as { slug?: unknown })?.slug === 'string')
  const opt = (m: (typeof ok)[number]): ModelOpt => ({ id: m.slug, label: `${m.display_name ?? m.slug}${m.visibility === 'list' ? '' : ' (hidden)'}` })
  return [...ok.filter(m => m.visibility === 'list'), ...ok.filter(m => m.visibility !== 'list')].map(opt)
}

export function codexModels(home = process.env.CODEX_HOME ?? path.join(os.homedir(), '.codex')): ModelOpt[] {
  try { return parseCodexCache(JSON.parse(fs.readFileSync(path.join(home, 'models_cache.json'), 'utf8'))) } catch { return [] }
}

/** Aliases first, then every id Anthropic lists for the saved key (none when there is no key or the call fails). */
export async function claudeModels(apiModels: () => Promise<string[]>): Promise<ModelOpt[]> {
  const ids = await apiModels().catch(() => [])
  const seen = new Set(CLAUDE_ALIASES.map(a => a.id))
  return [...CLAUDE_ALIASES, ...ids.filter(id => !seen.has(id)).map(id => ({ id, label: id }))]
}
