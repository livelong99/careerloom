// Question gate (PERF-2): "should this interviewer line start an answer, and what kind of turn is it?" A gate returns a hint,
// never a command: the manual hotkey path never waits on it and a failed gate means "unsure", not "no answer".
import type { QuestionHint, Speaker } from '../types'

export type GateInput = { text: string; speaker: Speaker; /** up to 3 earlier lines, oldest first */ previous?: string[] }
/** `isQuestion: null` = unsure (the caller falls back or skips). `kind: null` = the gate did not say. */
export type GateVerdict = {
  isQuestion: boolean | null; complete: boolean; kind: QuestionHint['kind'] | null
  needsScreenshot: boolean | null; deep: boolean | null; confidence: number; source: QuestionHint['source']; ms: number
}
export interface QuestionGate {
  readonly id: 'heuristic' | 'jev'
  decide(input: GateInput, signal?: AbortSignal): Promise<GateVerdict>
}
