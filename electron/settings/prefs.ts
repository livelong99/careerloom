// Pure normalisers for the additive settings.json fields. A v0.1.1 file has none of them: every
// missing or malformed value falls back to its default, so loading never fails and never loses data.
import type { DocsDefaults, KeyId, KeyTest, Prefs, PrefsPatch } from './types'

export const KEY_IDS: readonly KeyId[] = ['openrouter', 'opencode', 'firecrawl', 'brave', 'exa', 'serper']
export const MAX_RETENTION_DAYS = 3650

export const defaultPrefs = (): Prefs => ({
  updates: { enabled: true },
  retention: { runLogDays: null },
  docs: { tone: 'warm', length: 'standard', humanize: true },
})

const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const pick = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback)

const strict = <T extends string>(v: unknown, allowed: readonly T[], name: string): T => {
  if (!allowed.includes(v as T)) throw new Error(`Unknown ${name}`)
  return v as T
}

export function normalizePrefs(raw: unknown): Prefs {
  const d = defaultPrefs()
  const r = rec(raw)
  const days = rec(r.retention).runLogDays
  const docs = rec(r.docs)
  const docsOut: DocsDefaults = {
    tone: pick(docs.tone, ['concise', 'warm', 'formal'] as const, d.docs.tone),
    length: pick(docs.length, ['short', 'standard'] as const, d.docs.length),
    humanize: typeof docs.humanize === 'boolean' ? docs.humanize : d.docs.humanize,
  }
  return {
    updates: { enabled: typeof rec(r.updates).enabled === 'boolean' ? (rec(r.updates).enabled as boolean) : d.updates.enabled },
    retention: { runLogDays: typeof days === 'number' && Number.isInteger(days) && days >= 1 && days <= MAX_RETENTION_DAYS ? days : null },
    docs: docsOut,
  }
}

/** Validates a renderer patch strictly (unlike `normalizePrefs`, bad values throw so the UI can show why). */
export function applyPrefsPatch(current: Prefs, patch: unknown): Prefs {
  const p = rec(patch) as PrefsPatch & Record<string, unknown>
  const next: Prefs = { updates: { ...current.updates }, retention: { ...current.retention }, docs: { ...current.docs } }
  const u = rec(p.updates)
  if ('enabled' in u) { if (typeof u.enabled !== 'boolean') throw new Error('updates.enabled must be true or false'); next.updates.enabled = u.enabled }
  const t = rec(p.retention)
  if ('runLogDays' in t) {
    const v = t.runLogDays
    if (v !== null && !(typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= MAX_RETENTION_DAYS)) throw new Error(`Keep run logs for 1–${MAX_RETENTION_DAYS} days, or forever`)
    next.retention.runLogDays = v as number | null
  }
  const d = rec(p.docs)
  if ('tone' in d) next.docs.tone = strict(d.tone, ['concise', 'warm', 'formal'] as const, 'tone')
  if ('length' in d) next.docs.length = strict(d.length, ['short', 'standard'] as const, 'length')
  if ('humanize' in d) { if (typeof d.humanize !== 'boolean') throw new Error('docs.humanize must be true or false'); next.docs.humanize = d.humanize }
  return next
}

export function normalizeKeyMeta(raw: unknown): Partial<Record<KeyId, KeyTest>> {
  const out: Partial<Record<KeyId, KeyTest>> = {}
  const r = rec(raw)
  for (const id of KEY_IDS) {
    const t = rec(r[id])
    if (typeof t.ok !== 'boolean' || typeof t.at !== 'number') continue
    out[id] = { ok: t.ok, latencyMs: typeof t.latencyMs === 'number' ? t.latencyMs : null, detail: typeof t.detail === 'string' ? t.detail.slice(0, 300) : '', at: t.at }
  }
  return out
}
