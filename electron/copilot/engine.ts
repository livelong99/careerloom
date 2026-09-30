// Contract stub (WP0): interface only. The owning work package implements it in this file.
import type { CopilotConfig, DetectedQuestion, Suggestion, TranscriptLine } from './types'

export type AnswerRequest = { question: DetectedQuestion; transcript: TranscriptLine[]; kind: 'answer' | 'followup' | 'clarify' | 'summarise'; signal: AbortSignal }
/** Owner: WP2. Streaming provider (OpenRouter in M1); the interface keeps other providers possible. */
export interface AnswerProvider {
  readonly id: CopilotConfig['engine']['provider']
  stream(prompt: { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }>; model: string; signal: AbortSignal }): AsyncIterable<{ delta: string } | { usage: { promptTokens: number; completionTokens: number } }>
}
/** Owner: WP2. Emits partial Suggestions (done:false) then a final one; abortable. */
export interface AnswerEngine {
  answer(req: AnswerRequest): AsyncIterable<Suggestion>
  cancelAll(): void
}
