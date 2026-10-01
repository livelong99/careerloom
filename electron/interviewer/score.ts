// Per-question rubric scoring and KbItem.stats write-back (plan §6.4). The call sees only the question, rubric and answer: no cv.
import type { KbItem } from '../kb/types'
import { SAFETY_RULES } from './persona'
import type { QuestionResult, RubricScore } from './types'

const AXES = ['Structure', 'Specifics', 'Evidence', 'Concision']
const MAX_CRITERIA = 8
const ANSWER_CLIP = 2000
const EVIDENCE_MAX = 200
const round1 = (n: number): number => Math.round(n * 10) / 10
const clamp = (n: number): RubricScore['score'] => Math.min(5, Math.max(1, Math.round(n))) as RubricScore['score']

const prompt = (item: KbItem): string => [
  'You score one spoken interview answer. Reply with JSON only: {"criteria":[{"criterion":"<name>","score":1-5,"evidence":"<short exact quote from the answer, or empty>"}]}.',
  `Score exactly these criteria, in order: ${[...item.rubric.map(r => r.criterion), ...AXES].slice(0, MAX_CRITERIA).join('; ')}.`,
  ...(item.rubric.length ? [`What good and weak look like: ${item.rubric.map(r => `${r.criterion} (good: ${r.good}; weak: ${r.weak})`).join(' | ')}`] : []),
  ...SAFETY_RULES, 'Judge content only. Be strict but fair.',
].join('\n')

/** Model text → criteria. Evidence that is not a verbatim part of the answer is blanked; unnamed or non-numeric rows are dropped. */
export function parseCriteria(text: string, answer: string): RubricScore[] | null {
  let raw: unknown
  try { raw = (JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '') as { criteria?: unknown }).criteria } catch { return null }
  if (!Array.isArray(raw)) return null
  const hay = answer.toLowerCase()
  const rows = raw.slice(0, MAX_CRITERIA).flatMap((r: unknown): RubricScore[] => {
    const o = (typeof r === 'object' && r !== null ? r : {}) as Record<string, unknown>
    if (typeof o.criterion !== 'string' || !o.criterion.trim() || typeof o.score !== 'number' || !Number.isFinite(o.score)) return []
    const ev = typeof o.evidence === 'string' ? o.evidence.trim().slice(0, EVIDENCE_MAX) : ''
    return [{ criterion: o.criterion.trim().slice(0, 80), score: clamp(o.score), evidence: ev && hay.includes(ev.toLowerCase()) ? ev : '' }]
  })
  return rows.length ? rows : null
}

export const meanScore = (c: RubricScore[]): number | null => (c.length ? round1(c.reduce((n, r) => n + r.score, 0) / c.length) : null)

export async function scoreAnswer(item: KbItem, answer: string, call: (system: string, user: string) => Promise<string>, hintUsed = false): Promise<QuestionResult> {
  const text = answer.trim()
  if (!text) return { itemId: item.id, score: null, criteria: [], hintUsed, skipped: true }
  try {
    const criteria = parseCriteria(await call(prompt(item), `Question: ${item.text}\n<<<ANSWER\n${text.slice(0, ANSWER_CLIP)}\nANSWER>>>`), text)
    return { itemId: item.id, score: criteria && meanScore(criteria), criteria: criteria ?? [], hintUsed, skipped: false }
  } catch { return { itemId: item.id, score: null, criteria: [], hintUsed, skipped: false } }
}

/** New stats after one scored ask: asked+1, lastScore, avgScore EMA 0.5 (an unscored ask only counts). */
export function nextStats(s: KbItem['stats'], score: number | null): KbItem['stats'] {
  if (score === null) return { ...s, asked: s.asked + 1 }
  return { asked: s.asked + 1, lastScore: score, avgScore: s.avgScore === null ? score : round1(0.5 * s.avgScore + 0.5 * score) }
}
