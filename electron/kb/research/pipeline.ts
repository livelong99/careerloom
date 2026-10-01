// WP2 owns this file. Phases with checkpoints in run.json, resume, progress events (plan §3.2).
import { todo } from '../todo'
import type { ResearchOptions, ResearchProgress } from '../types'

export type PipelineDeps = { onProgress(p: ResearchProgress): void; signal: AbortSignal }
export const runResearch = (_jobId: string, _opts: ResearchOptions, _deps: PipelineDeps): Promise<void> => todo('WP2')
