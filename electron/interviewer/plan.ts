// Validation of an InterviewPlan at the IPC boundary, its stable hash, and the "what will I get" preview (plan §4, §10).
import { createHash } from 'node:crypto'

import type { KbItem } from '../kb/types'
import { questionBudget, selectNext, type SelectCtx } from './select'
import type { InterviewMode, InterviewPlan, InterviewerState, TtsEngineId } from './types'

const MODES: readonly InterviewMode[] = ['recruiter', 'mixed', 'behavioural', 'technical', 'system-design', 'coding']
const DIFFICULTY = ['adaptive', 'easier', 'match', 'harder'] as const
const ENGINES: readonly TtsEngineId[] = ['system', 'kokoro', 'openrouter']
const ECHO = ['speakers', 'headphones'] as const
const ID = /^[\w.-]{1,80}$/

const pick = <T extends string>(v: unknown, allowed: readonly T[], name: string): T => {
  if (typeof v !== 'string' || !allowed.includes(v as T)) throw new Error(`${name} must be one of: ${allowed.join(', ')}`)
  return v as T
}
const text = (v: unknown, name: string, max: number): string => {
  if (typeof v !== 'string' || v.trim() === '' || v.length > max) throw new Error(`${name} must be 1–${max} characters`)
  return v.trim()
}
const num = (v: unknown, name: string, lo: number, hi: number): number => {
  if (typeof v !== 'number' || !Number.isFinite(v) || v < lo || v > hi) throw new Error(`${name} must be ${lo}–${hi}`)
  return v
}
const list = (v: unknown, name: string, max: number, ok: (s: string) => boolean): string[] => {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.length > max || !v.every(x => typeof x === 'string' && ok(x))) throw new Error(`${name} must be a list of up to ${max} valid entries`)
  return v as string[]
}

/** Never trusts the renderer: every field is checked and the result is a fresh object. */
export function parsePlan(raw: unknown): InterviewPlan {
  const r = (typeof raw === 'object' && raw !== null && !Array.isArray(raw) ? raw : null) as Record<string, unknown> | null
  if (!r) throw new Error('interview plan must be an object')
  const p = (r.persona ?? {}) as Record<string, unknown>
  const v = (r.voice ?? {}) as Record<string, unknown>
  const minutes = r.minutes === null ? null : num(r.minutes, 'minutes', 1, 180)
  if (typeof r.includeGenerated !== 'boolean') throw new Error('includeGenerated must be true or false')
  const ids = list(r.itemIds, 'itemIds', 100, s => ID.test(s))
  return {
    mode: pick(r.mode, MODES, 'mode'), minutes, focusSkills: list(r.focusSkills, 'focusSkills', 20, s => s.length >= 1 && s.length <= 60),
    difficulty: pick(r.difficulty, DIFFICULTY, 'difficulty'), includeGenerated: r.includeGenerated,
    persona: { style: text(p.style, 'persona style', 60), seniority: text(p.seniority, 'persona seniority', 60), strictness: Math.round(num(p.strictness, 'strictness', 1, 5)) as 1 | 2 | 3 | 4 | 5, name: text(p.name, 'persona name', 40) },
    voice: { engine: pick(v.engine, ENGINES, 'voice engine'), voiceId: text(v.voiceId, 'voice id', 80), speed: num(v.speed, 'voice speed', 0.5, 2) },
    echo: pick(r.echo, ECHO, 'echo'), ...(ids.length ? { itemIds: ids } : {}),
  }
}

export const planHash = (p: InterviewPlan): string => createHash('sha1').update(JSON.stringify([p.mode, p.minutes, [...p.focusSkills].sort(), p.difficulty, p.includeGenerated, p.persona, p.itemIds ?? []])).digest('hex').slice(0, 12)

const LLM_USD_PER_QUESTION = 0.005 // nano-class: one probe check + one score per question (plan §10)
const OPENROUTER_TTS_USD = 0.02
const MINUTES_PER_QUESTION = 3.75

/** A dry run of the selector over the pool: how many questions, how many sourced, rough cost and length. */
export function previewPlan(pool: KbItem[], plan: InterviewPlan, ctx: SelectCtx = {}): { questions: number; sourced: number; usd: number; minutes: number } {
  const budget = questionBudget(plan.minutes)
  let st: InterviewerState = { sessionId: 'preview', seed: 'preview', phase: 'questions', asked: [], probes: 0, difficulty: 3, startedAt: 0, mix: {} }
  let sourced = 0
  for (let i = 0; i < budget; i++) {
    const it = selectNext(pool, plan, st, ctx)
    if (!it) break
    if (it.provenance !== 'generated') sourced += 1
    st = { ...st, asked: [...st.asked, it.id], mix: { ...st.mix, [it.type]: (st.mix[it.type] ?? 0) + 1 } }
  }
  const questions = st.asked.length
  const usd = Math.round((questions * LLM_USD_PER_QUESTION + (plan.voice.engine === 'openrouter' ? OPENROUTER_TTS_USD : 0)) * 1000) / 1000
  return { questions, sourced, usd, minutes: plan.minutes ?? Math.round(questions * MINUTES_PER_QUESTION) }
}
