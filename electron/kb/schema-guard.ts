// Everything read from disk or an import file passes through here: clamp, never trust (plan §9).
import { itemId } from './hash'
import type { Difficulty, Expected, KbItem, KbManifest, KbNotes, KbQuestionType, Provenance, SkillNode, SourceKind, SourceRef } from './types'

export const LIMITS = { items: 400, text: 300, line: 200, list: 12, notes: 12, jobBytes: 8 * 1024 * 1024 } as const

const TYPES: readonly KbQuestionType[] = ['behavioural', 'technical', 'system-design', 'coding', 'situational', 'recruiter']
const PROVENANCE: readonly Provenance[] = ['sourced', 'generated', 'user']
const EXPECTED: readonly Expected[] = ['aware', 'working', 'strong', 'expert']
const KINDS: readonly SourceKind[] = ['official-doc', 'eng-blog', 'github', 'qa-site', 'forum', 'company-page', 'other']

const ID = /^[\w-]{1,80}$/
type Rec = Record<string, unknown>
const isRec = (v: unknown): v is Rec => typeof v === 'object' && v !== null && !Array.isArray(v)
const str = (v: unknown, max: number, fallback = ''): string => (typeof v === 'string' ? v.trim().slice(0, max) : fallback)
const num = (v: unknown, lo: number, hi: number, fallback: number): number => (typeof v === 'number' && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback)
const oneOf = <T extends string>(v: unknown, set: readonly T[], fallback: T): T => (set.includes(v as T) ? (v as T) : fallback)
const strings = (v: unknown, max: number = LIMITS.line, n: number = LIMITS.list): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string' && x.trim() !== '').slice(0, n).map(x => x.trim().slice(0, max)) : [])
const bool = (v: unknown): boolean => v === true
const score = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? Math.min(5, Math.max(0, v)) : null)

/** Null when there is no usable question text. The id is always recomputed from the text. */
export function parseItem(raw: unknown): KbItem | null {
  if (!isRec(raw)) return null
  const text = str(raw.text, LIMITS.text)
  if (text === '') return null
  const hooks = isRec(raw.hooks) ? raw.hooks : {}
  const user = isRec(raw.user) ? raw.user : {}
  const stats = isRec(raw.stats) ? raw.stats : {}
  return {
    // A user-edited item keeps its id (stats and pins hang off it); every other id is derived from the text.
    id: user.edited === true && typeof raw.id === 'string' && ID.test(raw.id) ? raw.id : itemId(text), text, type: oneOf(raw.type, TYPES, 'technical'), skills: strings(raw.skills, 80),
    difficulty: Math.round(num(raw.difficulty, 1, 5, 3)) as Difficulty,
    // An unknown origin is shown as generated, the label that asks for the most scepticism.
    provenance: oneOf(raw.provenance, PROVENANCE, 'generated'),
    sources: Array.isArray(raw.sources) ? raw.sources.filter(isRec).slice(0, LIMITS.list).map(s => ({ sourceId: str(s.sourceId, 80), note: str(s.note, LIMITS.line) })).filter(s => s.sourceId !== '') : [],
    seen: Math.max(1, Math.round(num(raw.seen, 1, 1e6, 1))), confidence: num(raw.confidence, 0, 1, 0.5),
    idealOutline: strings(raw.idealOutline), followUps: strings(raw.followUps), redFlags: strings(raw.redFlags),
    rubric: Array.isArray(raw.rubric) ? raw.rubric.filter(isRec).slice(0, 5).map(r => ({ criterion: str(r.criterion, 80), good: str(r.good, LIMITS.line), weak: str(r.weak, LIMITS.line) })).filter(r => r.criterion !== '') : [],
    hooks: { storyIds: strings(hooks.storyIds, 80), gap: typeof hooks.gap === 'string' ? str(hooks.gap, LIMITS.line) : null, cvFacts: strings(hooks.cvFacts) },
    user: { pinned: bool(user.pinned), hidden: bool(user.hidden), edited: bool(user.edited), notes: typeof user.notes === 'string' ? str(user.notes, 2000) : null },
    stats: { asked: Math.round(num(stats.asked, 0, 1e6, 0)), lastScore: score(stats.lastScore), avgScore: score(stats.avgScore) },
  }
}
export const parseItems = (raw: unknown): KbItem[] => (Array.isArray(raw) ? raw.map(parseItem).filter((i): i is KbItem => i !== null) : [])

export const parseSources = (raw: unknown): SourceRef[] => (Array.isArray(raw) ? raw.filter(isRec).flatMap((s): SourceRef[] => {
  const id = str(s.id, 80)
  const url = str(s.url, 2000)
  return id && /^https?:\/\//i.test(url) ? [{ id, url, title: str(s.title, LIMITS.line), host: str(s.host, 200), kind: oneOf(s.kind, KINDS, 'other'), licence: typeof s.licence === 'string' ? str(s.licence, 80) : null, fetchedAt: num(s.fetchedAt, 0, Number.MAX_SAFE_INTEGER, 0), contentHash: str(s.contentHash, 64), trust: Math.round(num(s.trust, 0, 2, 0)) as 0 | 1 | 2 }] : []
}) : [])

export const parseSkills = (raw: unknown): SkillNode[] => (Array.isArray(raw) ? raw.filter(isRec).flatMap((s): SkillNode[] => {
  const id = str(s.id, 80)
  const name = str(s.name, 80)
  return id && name ? [{ id, name, family: typeof s.family === 'string' ? str(s.family, 80) : null, origin: oneOf(s.origin, ['jd', 'gap', 'cv', 'taxonomy', 'user'] as const, 'jd'), expected: oneOf(s.expected, EXPECTED, 'working'), weight: num(s.weight, 0, 1, 0.5), inCv: bool(s.inCv) }] : []
}) : [])

export const parseNotes = (raw: unknown): KbNotes => {
  const r = isRec(raw) ? raw : {}
  return { company: strings(r.company, LIMITS.line, LIMITS.notes), role: strings(r.role, LIMITS.line, LIMITS.notes), interviewerStyle: strings(r.interviewerStyle, LIMITS.line, LIMITS.notes), loop: strings(r.loop, LIMITS.line, LIMITS.notes) }
}

export function parseManifest(raw: unknown): KbManifest | null {
  if (!isRec(raw) || raw.schema !== 1 || typeof raw.jobId !== 'string') return null
  const coverage = isRec(raw.coverage) ? Object.fromEntries(Object.entries(raw.coverage).filter(([, v]) => typeof v === 'number').slice(0, 50)) as Record<string, number> : {}
  return { schema: 1, jobId: str(raw.jobId, 200), inputHash: str(raw.inputHash, 64), researchedAt: num(raw.researchedAt, 0, Number.MAX_SAFE_INTEGER, 0), runner: str(raw.runner, 80), model: typeof raw.model === 'string' ? str(raw.model, 120) : null, costUsd: num(raw.costUsd, 0, 1e6, 0), searches: num(raw.searches, 0, 1e6, 0), pages: num(raw.pages, 0, 1e6, 0), status: oneOf(raw.status, ['complete', 'partial', 'failed'] as const, 'partial'), coverage }
}
