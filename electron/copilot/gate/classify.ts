import type { Classify } from '../detector'
import type { QuestionType } from '../types'
import type { QuestionGate } from './types'

const TYPE: Record<string, QuestionType> = { coding: 'coding', 'system-design': 'system-design', behavioural: 'behavioural', factual: 'technical', 'small-talk': 'other' }

/** The detector's ambiguous-line slot backed by a model gate: only a model verdict counts (the heuristic already said "unsure"). */
export const gateClassify = (gate: QuestionGate): Classify => async text => {
  const v = await gate.decide({ text, speaker: 'interviewer' })
  if (v.source === 'heuristic' || v.isQuestion === null) return null
  const kind = v.kind ?? 'factual'
  return { isQuestion: v.isQuestion, type: TYPE[kind] ?? 'other', hint: { kind, complete: v.complete, needsScreenshot: v.needsScreenshot ?? false, deep: v.deep ?? (kind === 'coding' || kind === 'system-design'), source: v.source } }
}
