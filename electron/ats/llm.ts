// What the agent may tell us, and what we keep. The agent extracts and judges; it never scores. Pure.
import type { MatchKind } from './skills'
import type { BulletNote } from './bullets'

export type JdReq = { id: string; text: string; skill: string; required: boolean; years?: number }
export type Judgement = { req_id: string; match: MatchKind; cv_quote?: string; certain: boolean }
export type LlmExtraction = { reqs: JdReq[]; judgements: Judgement[]; notes: BulletNote[] }

const SCORE_KEYS = /^(score|scores|total|overall|match_score|ats_score|parse_score|points|rating|grade|percent|percentage|confidence)$/i

/** Remove every score-like field at any depth: code owns the arithmetic. */
export function stripScores<T>(value: T): T {
  if (Array.isArray(value)) return value.map(stripScores) as T
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([k]) => !SCORE_KEYS.test(k)).map(([k, v]) => [k, stripScores(v)])) as T
  }
  return value
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const KINDS = new Set(['exact', 'synonym', 'taxonomy', 'none'])

/** Tolerant validation of the extraction part of the agent's JSON: junk entries are dropped, not fatal. */
export function readExtraction(raw: unknown): LlmExtraction {
  const r = stripScores(raw && typeof raw === 'object' ? raw as Record<string, unknown> : {})
  const jd = (r.jd && typeof r.jd === 'object' ? r.jd : {}) as Record<string, unknown>
  const reqs = (Array.isArray(jd.requirements) ? jd.requirements : []).flatMap((x, i): JdReq[] => {
    const o = (x ?? {}) as Record<string, unknown>
    const skill = str(o.skill)
    if (!skill) return []
    const years = typeof o.years === 'number' && o.years > 0 && o.years < 40 ? o.years : undefined
    return [{ id: str(o.id) || `r${i + 1}`, text: str(o.text) || skill, skill, required: o.required !== false, years }]
  })
  const judgements = (Array.isArray(r.judgements) ? r.judgements : []).flatMap((x): Judgement[] => {
    const o = (x ?? {}) as Record<string, unknown>
    const match = str(o.match)
    return str(o.req_id) && KINDS.has(match) ? [{ req_id: str(o.req_id), match: match as MatchKind, cv_quote: str(o.cv_quote) || undefined, certain: o.certain !== false }] : []
  })
  const notes = (Array.isArray(r.bullet_notes) ? r.bullet_notes : []).flatMap((x): BulletNote[] => {
    const o = (x ?? {}) as Record<string, unknown>
    return typeof o.line === 'number' && str(o.quote) ? [{ line: o.line, specific: o.specific === true, quote: str(o.quote) }] : []
  })
  return { reqs, judgements, notes }
}
