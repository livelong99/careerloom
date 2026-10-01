// WP1 owns this file. Live/practice retrieval over a job's KB (plan §6.1).
import { todo } from './todo'
import type { KbItem, KbQuestionType } from './types'

export type RetrieveOpts = { type?: KbQuestionType; k?: number }
export const retrieve = (_jobId: string, _query: string, _opts?: RetrieveOpts): KbItem[] => todo('WP1')
/** Deterministic, byte-stable `## QUESTION BASE` block for the grounding prefix (≤ budgetTokens). */
export const kbPrefix = (_jobId: string, _budgetTokens?: number): string => todo('WP1')
/** Items the interviewer may pick from (hidden excluded). */
export const selectionPool = (_jobId: string): KbItem[] => todo('WP1')
