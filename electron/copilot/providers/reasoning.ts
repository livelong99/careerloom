// Per-model `reasoning` request shape. OpenRouter docs (openrouter.ai/docs/use-cases/reasoning-tokens): `enabled:false` / `effort:"none"`
// are REJECTED by mandatory-reasoning models; `effort:"minimal"` (~10% of max_tokens) and omitting the field are always accepted.
// The model list's `mandatory` flag isn't in our curated data, so: start from a family guess, and on a 400 that names reasoning
// walk the ladder (omit -> minimal -> low -> disabled) and remember what worked per model.
export type ReasoningShape = { enabled: false } | { effort: 'minimal' | 'low' } | null
const LADDER: ReasoningShape[] = [null, { effort: 'minimal' }, { effort: 'low' }, { enabled: false }]

// Families that think by default (omitting the field leaves them slow): ask for the least reasoning.
const THINKS = /(^|\/)(o[1-9]|gpt-[56][\w.-]*|gemini-(3|2\.5-pro|2\.5-flash$)[\w.-]*|deepseek-r1|.*thinking.*)/i
export const initialReasoning = (model: string): ReasoningShape => (THINKS.test(model) ? { effort: 'minimal' } : null)

export const isReasoningRejection = (status: number, message: string): boolean => status === 400 && /reasoning|effort/i.test(message)

const same = (a: ReasoningShape, b: ReasoningShape): boolean => JSON.stringify(a) === JSON.stringify(b)
/** The next untried shape, or undefined when the ladder is exhausted. */
export function nextReasoning(tried: ReasoningShape[]): ReasoningShape | undefined {
  return LADDER.find(s => !tried.some(t => same(t, s)))
}
