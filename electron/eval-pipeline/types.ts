// Shared shapes for the staged evaluation pipeline. Pure types: no Electron, no I/O.
import type { CvModel } from '../ats/model'
import type { PrescreenPolicy } from '../contract'
import type { Profile } from '../prescreen-core'

export type EvalJob = { id: string; url: string; title: string; company: string; location: string | null }
export type FetchedJob = EvalJob & { jd: string; jdHash: string }

/** What the candidate side of every stage reads — built once per run. */
export type Candidate = { profile: Profile; policy: PrescreenPolicy; cv: CvModel; profileKey: string; /** Jobs the user marked relevant: never dropped by stages 1-2. */ pinned?: ReadonlySet<string> }

export type Decision = 'Apply' | 'Consider' | 'Research first' | 'Skip'
/** The batched model's judgement of one job (strict JSON, see stage3-batch.ts). */
export type Light = { fit: number; decision: Decision; archetype: string; summary: string; strengths: string[]; gaps: string[]; hardStop: string | null }

export type StageId = 'fetch' | 'filter' | 'score' | 'llm' | 'write'
/** What happened to one job. `light` = batched verdict (written by stage 4); `deep` = hand to the full agent;
 *  `skip` = dropped by a stage (reason says which); `failed` = could not be judged (stays pending, retried next run). */
export type Fate = 'skip' | 'light' | 'deep' | 'failed'
export type JobResult = { jobId: string; fate: Fate; stage: StageId; reason: string; local: number | null; light: Light | null; cached?: boolean; dupOf?: string }

export type StageMetric = { stage: StageId; inCount: number; outCount: number; ms: number; inputTokens: number; outputTokens: number; usd: number; errors: number; note?: string }

export type PipelineConfig = {
  fetchConcurrency: number
  llmConcurrency: number
  /** Jobs per model request. */
  batchSize: number
  /** Stage-2 score (0-100) below which a job is dropped without a model call. */
  skipBelow: number
  /** Batched fit (0-5) at or above which a job is escalated to the full agent. */
  escalateMin: number
  /** Cap on escalations per run; the rest keep their batched verdict. */
  maxDeep: number
  /** Characters of each JD sent to the model. */
  jdChars: number
  /** Cap on one request's JD text: keeps the prompt inside a safe command-line length for CLI runners. */
  maxPromptChars: number
  /** Stop calling the model once this much is spent (null = no cap). */
  budgetUsd: number | null
  model?: string
}

export const DEFAULT_CONFIG: PipelineConfig = {
  fetchConcurrency: 8, llmConcurrency: 3, batchSize: 8, skipBelow: 35, escalateMin: 4, maxDeep: 20, jdChars: 1800, maxPromptChars: 24_000, budgetUsd: null,
}

export type LlmRequest = { system: string; user: string; model?: string; signal?: AbortSignal }
export type LlmReply = { text: string; inputTokens: number; outputTokens: number; model: string; usd?: number | null }
export type LlmCall = (req: LlmRequest) => Promise<LlmReply>

export type PipelineResult = { runId: string; results: JobResult[]; metrics: StageMetric[]; totalUsd: number; cancelled: boolean }
