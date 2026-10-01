// AI-interviewer contract (types only; frozen at G-A, docs/plans/job-knowledge-base/plan.md §4, §6).
import type { Difficulty, KbQuestionType } from '../kb/types'

export type TtsEngineId = 'system' | 'kokoro' | 'openrouter'
export type InterviewMode = 'recruiter' | 'mixed' | 'behavioural' | 'technical' | 'system-design' | 'coding'
export type InterviewPlan = {
  mode: InterviewMode
  /** null = open-ended. */
  minutes: number | null
  focusSkills: string[]
  difficulty: 'adaptive' | 'easier' | 'match' | 'harder'
  includeGenerated: boolean
  persona: { style: string; seniority: string; strictness: 1 | 2 | 3 | 4 | 5; name: string }
  voice: { engine: TtsEngineId; voiceId: string; speed: number }
  echo: 'speakers' | 'headphones'
  /** Pins the session to these items (replay a set). */
  itemIds?: string[]
}

export type InterviewerPhase = 'warmup' | 'questions' | 'closing' | 'done'
/** What the selector reads and the runner advances; deterministic given `seed`. */
export type InterviewerState = {
  sessionId: string; seed: string; phase: InterviewerPhase
  asked: string[]; probes: number; difficulty: Difficulty; startedAt: number
  mix: Partial<Record<KbQuestionType, number>>
}
export type Turn = { role: 'interviewer' | 'candidate'; text: string; at: number; itemId: string | null; probe: boolean }
export type RubricScore = { criterion: string; score: 1 | 2 | 3 | 4 | 5; evidence: string }
export type QuestionResult = { itemId: string; score: number | null; criteria: RubricScore[]; hintUsed: boolean; skipped: boolean }
/** Optional addition to the stored session (SessionDetail.interview). */
export type InterviewRecord = { planHash: string; itemIds: string[]; perQuestion: QuestionResult[] }
