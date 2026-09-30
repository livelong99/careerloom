// Contract stub (WP0): interface only. The owning work package implements it in this file.
import type { CopilotConfig, DetectedQuestion, TranscriptLine } from './types'

export type PromptInput = { grounding: string; coaching: CopilotConfig['coaching']; question: DetectedQuestion; transcript: TranscriptLine[]; kind: 'answer' | 'followup' | 'clarify' | 'summarise' }
export type BuiltPrompt = { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }> }
/** Owner: WP2. System rules + injection fence (transcript is untrusted data). */
export interface PromptBuilder {
  build(input: PromptInput): BuiltPrompt
}
