// Per-turn routing (PERF-2): question kind -> tier, token budget, prompt variant, whether to skip the model at all, and
// whether the turn needs a screenshot. Inputs are the gate hint (heuristic or Jev) with the rules as fallback. Pure.
import { heuristicHint } from './detector'
import type { PromptKind } from './prompts'
import type { CopilotConfig, DetectedQuestion, QuestionHint, Suggestion } from './types'

export type Route = {
  kind: QuestionHint['kind']
  tier: Suggestion['tier']
  /** Multiplies the tier's token cap (small talk and plain facts need far less than a design answer). */
  maxTokensScale: number
  variant: 'default' | 'brief'
  needsScreenshot: boolean
  /** Auto-asked small talk only: show the line, spend nothing. A hotkey press is never skipped. */
  skipLlm: boolean
}

export function routeQuestion(q: Pick<DetectedQuestion, 'text' | 'auto' | 'hint'>, cfg: CopilotConfig['engine'], kind: PromptKind = 'answer'): Route {
  const hint = q.hint ?? heuristicHint(q.text)
  const small = hint.kind === 'small-talk'
  const deep = (kind === 'answer' || kind === 'detail') && cfg.escalateForDesignCoding && !small && (hint.kind === 'coding' || hint.kind === 'system-design' || hint.deep)
  const detail = kind === 'detail'
  return {
    kind: hint.kind,
    tier: small && !detail ? 'fast' : deep ? 'deep' : cfg.tier,
    maxTokensScale: detail ? 2.5 : small ? 0.4 : hint.kind === 'factual' ? 0.75 : 1, // More detail: about 250 words plus background
    variant: !detail && (small || hint.kind === 'factual') ? 'brief' : 'default',
    needsScreenshot: hint.needsScreenshot,
    skipLlm: kind === 'answer' && q.auto && small,
  }
}
