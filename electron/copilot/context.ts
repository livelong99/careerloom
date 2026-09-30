// Contract stub (WP0): interface only. The owning work package implements it in this file.
import type { ContextPreview, ContextSummary, TranscriptLine } from './types'

export type GroundingContext = { prefix: string; tokens: number; summary: ContextSummary }
/** Owner: WP2. Builds the stable, cacheable grounding prefix (posting + report + cv facts + STAR stories). */
export interface ContextBuilder {
  build(jobId: string): Promise<GroundingContext>
  preview(jobId: string): Promise<ContextPreview>
  /** Rolling transcript window, newest first under a char/token budget. */
  window(lines: TranscriptLine[], budgetTokens: number): TranscriptLine[]
}
