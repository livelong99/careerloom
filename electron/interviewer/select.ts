// Next-question scoring (plan §6.2). Deterministic from the session seed; pure.
import { createHash } from 'node:crypto'

import type { Difficulty, KbItem, KbQuestionType, SkillNode } from '../kb/types'
import type { InterviewMode, InterviewPlan, InterviewerState } from './types'

export type Group = 'behavioural' | 'technical' | 'design' | 'recruiter'
export type SelectCtx = { skills?: SkillNode[]; /** ids asked in the last 5 sessions */ recent?: ReadonlySet<string> }

const GROUP: Record<KbQuestionType, Group> = { behavioural: 'behavioural', situational: 'behavioural', technical: 'technical', coding: 'technical', 'system-design': 'design', recruiter: 'recruiter' }
export const groupOf = (t: KbQuestionType): Group => GROUP[t]
/** Mixed-loop target 3 behavioural : 4 technical : 1 design. */
const MIX: Record<Group, number> = { behavioural: 3 / 8, technical: 4 / 8, design: 1 / 8, recruiter: 0 }
const ALLOWED: Record<InterviewMode, (t: KbQuestionType) => boolean> = {
  recruiter: t => t === 'recruiter', mixed: t => t !== 'recruiter', behavioural: t => groupOf(t) === 'behavioural',
  technical: t => t === 'technical', 'system-design': t => t === 'system-design', coding: t => t === 'coding',
}
const MINUTES_PER_QUESTION = 3.75
const OPEN_ENDED_QUESTIONS = 12

export const questionBudget = (minutes: number | null): number => (minutes === null ? OPEN_ENDED_QUESTIONS : Math.max(1, Math.round(minutes / MINUTES_PER_QUESTION)))
const clampD = (n: number): Difficulty => Math.min(5, Math.max(1, n)) as Difficulty
/** +1 after two answers ≥ 4, −1 after two ≤ 2 (looks at the last two scores only). */
export const nextDifficulty = (current: Difficulty, scores: number[]): Difficulty => {
  const [a, b] = scores.slice(-2)
  if (a === undefined || b === undefined) return current
  return a >= 4 && b >= 4 ? clampD(current + 1) : a <= 2 && b <= 2 ? clampD(current - 1) : current
}

const jitter = (seed: string, id: string): number => parseInt(createHash('sha1').update(`${seed}|${id}`).digest('hex').slice(0, 6), 16) / 0xffffff

export function selectNext(pool: KbItem[], plan: InterviewPlan, state: InterviewerState, ctx: SelectCtx = {}): KbItem | null {
  const asked = new Set(state.asked)
  const pinned = plan.itemIds ? new Set(plan.itemIds) : null
  const byId = new Map((ctx.skills ?? []).map(s => [s.id, s]))
  const total = Object.values(state.mix).reduce((n, v) => n + (v ?? 0), 0)
  const have: Record<Group, number> = { behavioural: 0, technical: 0, design: 0, recruiter: 0 }
  for (const [t, n] of Object.entries(state.mix)) have[groupOf(t as KbQuestionType)] += n ?? 0
  const target = clampD(state.difficulty + (plan.difficulty === 'easier' ? -1 : plan.difficulty === 'harder' ? 1 : 0))

  let best: { it: KbItem; score: number } | null = null
  for (const it of pool) {
    if (it.user.hidden || asked.has(it.id) || (pinned && !pinned.has(it.id))) continue
    if (!plan.includeGenerated && it.provenance === 'generated') continue
    if (!ALLOWED[plan.mode](it.type)) continue
    const nodes = it.skills.flatMap(s => byId.get(s) ?? [])
    const jobWeight = nodes.length ? Math.max(...nodes.map(n => n.weight)) : 0.5
    const weak = it.skills.some(s => plan.focusSkills.includes(s)) || nodes.some(n => !n.inCv) || (it.stats.avgScore !== null && it.stats.avgScore < 3)
    const novelty = ctx.recent?.has(it.id) ? 0.2 : 1
    const g = groupOf(it.type)
    const deficit = MIX[g] * (total + 1) - have[g] // how far this group is under its share of the questions so far
    const balance = plan.mode === 'mixed' ? (deficit > 0 ? 1 + deficit : 0.15) : 1
    const fit = Math.max(0.2, 1 - 0.25 * Math.abs(it.difficulty - target))
    const focus = it.skills.some(s => plan.focusSkills.includes(s)) ? 3 : 1
    const score = jobWeight * (1 + 0.8 * (weak ? 1 : 0)) * focus * novelty * balance * fit * (0.7 + 0.3 * it.confidence) * (it.user.pinned ? 1.1 : 1) * (1 + 0.05 * jitter(state.seed, it.id))
    if (!best || score > best.score) best = { it, score }
  }
  return best?.it ?? null
}
