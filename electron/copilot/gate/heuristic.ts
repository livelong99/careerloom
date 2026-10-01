import { classifyByRules, heuristicHint } from '../detector'
import type { GateInput, GateVerdict, QuestionGate } from './types'

export { heuristicHint } // lives in detector.ts (the detector attaches it to every question)

/** The rules the detector already runs (plus the speaker check) as a gate, so the model gate has one interface to mirror. */
export function createHeuristicGate(now: () => number = Date.now): QuestionGate {
  return {
    id: 'heuristic',
    async decide({ text, speaker }: GateInput): Promise<GateVerdict> {
      const t0 = now()
      const h = heuristicHint(text)
      const rule = speaker === 'interviewer' ? classifyByRules(text) : { verdict: 'no' as const, confidence: 0.9 }
      const isQuestion = rule.verdict === 'question' ? true : rule.verdict === 'no' ? false : null
      return { isQuestion, complete: h.complete, kind: h.kind, needsScreenshot: h.needsScreenshot, deep: h.deep, confidence: rule.confidence, source: 'heuristic', ms: now() - t0 }
    },
  }
}
