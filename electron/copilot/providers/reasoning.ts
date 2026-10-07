// Per-model `reasoning` request shape. Thinking is OFF for live answers: a thinking model streams nothing visible until it has
// finished (so answers look like they only "load"), and some leak their chain of thought into the reply. OpenRouter docs
// (openrouter.ai/docs/use-cases/reasoning-tokens): `enabled:false` is REJECTED by mandatory-reasoning models, `effort:"minimal"`
// and omitting the field are always accepted. So every model starts at disabled and, on a 400 that names reasoning, walks the
// ladder (disabled -> minimal -> low -> omit) and we remember what worked per model.
export type ReasoningShape = { enabled: false } | { effort: 'minimal' | 'low' } | null
const LADDER: ReasoningShape[] = [{ enabled: false }, { effort: 'minimal' }, { effort: 'low' }, null]

export const initialReasoning = (_model: string): ReasoningShape => ({ enabled: false })

export const isReasoningRejection = (status: number, message: string): boolean => status === 400 && /reasoning|effort/i.test(message)

const same = (a: ReasoningShape, b: ReasoningShape): boolean => JSON.stringify(a) === JSON.stringify(b)
/** The next untried shape, or undefined when the ladder is exhausted. */
export function nextReasoning(tried: ReasoningShape[]): ReasoningShape | undefined {
  return LADDER.find(s => !tried.some(t => same(t, s)))
}
