// Auto-ask policy (PERF-2): which detected questions may start an answer without the hotkey. The detector and gate decide
// "is this a question"; this decides "may we spend on it": interviewer channel only, finished thought, not small talk, and a
// rate cap so a run of false positives cannot outspend the session ceiling (which still applies on top).
import { routeQuestion, type Route } from './routing'
import type { CopilotConfig, DetectedQuestion, SourceId, TranscriptLine } from './types'

export type AutoAskDecision = { ask: true; route: Route } | { ask: false; reason: 'speaker' | 'incomplete' | 'small-talk' | 'rate' }
const MIN_GAP_MS = 2500
const MAX_PER_MINUTE = 6

export function createAutoAsk(o: { now?: () => number } = {}) {
  const now = o.now ?? Date.now
  let asks: number[] = []
  return {
    decide(q: DetectedQuestion, line: TranscriptLine, sources: SourceId[], cfg: CopilotConfig['engine']): AutoAskDecision {
      // Mic-only live hears both voices, so a line cannot be attributed to the interviewer: the hotkey stays, auto-ask does not.
      if (line.speaker !== 'interviewer' || !sources.includes('system')) return { ask: false, reason: 'speaker' }
      if (q.hint?.complete === false) return { ask: false, reason: 'incomplete' }
      const route = routeQuestion(q, cfg)
      if (route.skipLlm) return { ask: false, reason: 'small-talk' }
      const t = now()
      asks = asks.filter(a => t - a < 60_000)
      if (asks.length >= MAX_PER_MINUTE || (asks.length && t - asks[asks.length - 1]! < MIN_GAP_MS)) return { ask: false, reason: 'rate' }
      asks.push(t)
      return { ask: true, route }
    },
    reset(): void { asks = [] },
  }
}
