// interview.json: research + voice + KB settings (plan §7). Same load/validate/clamp pattern as copilot/config.ts:
// a bad value falls back to the default for that field only, unknown keys are dropped, loading never throws.
import { app } from 'electron'
import fs from 'node:fs'

import { userFile } from '../context'
import type { DeepPartial } from '../copilot/types'
import { DEFAULT_INTERVIEW_CONFIG } from './defaults'
import type { InterviewConfig, ResearchSourceGroup, SearchBackendId } from './types'

const FILE = 'interview.json'
const BACKENDS: readonly SearchBackendId[] = ['brave', 'exa', 'serper', 'searxng']
const SOURCE_GROUPS: readonly ResearchSourceGroup[] = ['stackexchange', 'github', 'taxonomy', 'hn', 'companyPages', 'articles']

export { DEFAULT_INTERVIEW_CONFIG }

const obj = (v: unknown): Record<string, unknown> => (typeof v === 'object' && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : {})
const bool = (v: unknown, d: boolean): boolean => (typeof v === 'boolean' ? v : d)
const pick = <T extends string>(v: unknown, allowed: readonly T[], d: T): T => (allowed.includes(v as T) ? (v as T) : d)
const num = (v: unknown, d: number, min: number, max: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : d)
const intOrNull = (v: unknown, d: number | null, min: number, max: number): number | null => (v === null ? null : typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max ? v : d)
const strOrNull = (v: unknown, d: string | null, max = 200): string | null => (v === null ? null : typeof v === 'string' && v.length > 0 && v.length <= max ? v : d)

/** https, or http on loopback only (a self-hosted SearXNG); no credentials, no query. Anything else → null. */
function searxngUrl(v: unknown): string | null {
  if (typeof v !== 'string' || v.length > 200) return null
  try {
    const u = new URL(v)
    const loopback = ['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)
    if (u.protocol !== 'https:' && !(u.protocol === 'http:' && loopback)) return null
    if (u.username || u.password || u.search || u.hash) return null
    return `${u.origin}${u.pathname}`.replace(/\/+$/, '')
  } catch { return null }
}

function order(v: unknown, d: readonly SearchBackendId[]): SearchBackendId[] {
  const list = Array.isArray(v) ? [...new Set(v.filter((x): x is SearchBackendId => BACKENDS.includes(x as SearchBackendId)))] : []
  return list.length > 0 ? list : [...d]
}

/** Coerce anything (old/newer file, renderer patch) into a valid InterviewConfig. */
export function normalizeInterviewConfig(raw: unknown): InterviewConfig {
  const d = DEFAULT_INTERVIEW_CONFIG
  const r = obj(raw), rs = obj(r.research), se = obj(rs.search), so = obj(rs.sources), vo = obj(r.voice), kb = obj(r.kb)
  return {
    version: 1,
    research: {
      model: strOrNull(rs.model, d.research.model), depth: pick(rs.depth, ['quick', 'standard', 'deep'], d.research.depth),
      budgetUsd: num(rs.budgetUsd, d.research.budgetUsd, 0.05, 2), minutes: num(rs.minutes, d.research.minutes, 1, 20), allowAgent: bool(rs.allowAgent, d.research.allowAgent),
      search: { backend: pick(se.backend, BACKENDS, d.research.search.backend), fallbackOrder: order(se.fallbackOrder, d.research.search.fallbackOrder), searxngUrl: searxngUrl(se.searxngUrl) },
      // only the six allow-list groups exist here: the never-fetch hosts are a code constant (sources.ts), not a setting
      sources: Object.fromEntries(SOURCE_GROUPS.map(g => [g, bool(so[g], true)])) as Record<ResearchSourceGroup, boolean>,
      consentVersion: strOrNull(rs.consentVersion, null, 40), refreshAfterDays: num(rs.refreshAfterDays, d.research.refreshAfterDays, 1, 365),
    },
    voice: {
      engine: pick(vo.engine, ['system', 'kokoro', 'openrouter'], d.voice.engine), voiceId: strOrNull(vo.voiceId, d.voice.voiceId), speed: num(vo.speed, d.voice.speed, 0.7, 1.3),
      echo: pick(vo.echo, ['speakers', 'headphones'], d.voice.echo), tailMs: num(vo.tailMs, d.voice.tailMs, 150, 800),
      pushToInterrupt: strOrNull(vo.pushToInterrupt, d.voice.pushToInterrupt, 60) ?? d.voice.pushToInterrupt,
    },
    kb: { retentionDays: intOrNull(kb.retentionDays, d.kb.retentionDays, 1, 3650), maxItems: num(kb.maxItems, d.kb.maxItems, 50, 400), useInLive: bool(kb.useInLive, d.kb.useInLive) },
  }
}

/** Plain objects merge key by key; arrays and scalars (incl. null) replace. */
function merge(base: unknown, patch: unknown): unknown {
  if (typeof patch !== 'object' || patch === null || Array.isArray(patch) || typeof base !== 'object' || base === null || Array.isArray(base)) return patch
  const out: Record<string, unknown> = { ...(base as Record<string, unknown>) }
  for (const [k, v] of Object.entries(patch)) if (v !== undefined) out[k] = merge(out[k], v)
  return out
}

export function readInterviewConfig(): InterviewConfig {
  try { return normalizeInterviewConfig(JSON.parse(fs.readFileSync(userFile(FILE), 'utf8'))) } catch { return DEFAULT_INTERVIEW_CONFIG }
}

/** Validate-then-persist (temp file + rename). Returns the stored config. */
export function writeInterviewConfig(patch: DeepPartial<InterviewConfig>): InterviewConfig {
  const prev = readInterviewConfig()
  const next = normalizeInterviewConfig(merge(prev, patch))
  // consent is per provider (a different one sees different queries): switching without granting again re-prompts
  const grants = patch.research?.consentVersion !== undefined
  if (!grants && next.research.search.backend !== prev.research.search.backend) next.research.consentVersion = null
  const file = userFile(FILE)
  fs.mkdirSync(app.getPath('userData'), { recursive: true })
  fs.writeFileSync(`${file}.tmp`, JSON.stringify(next, null, 2), { mode: 0o600 })
  fs.renameSync(`${file}.tmp`, file)
  return next
}
