// Two main-side privacy guarantees for every model call the copilot makes (plan §9): local-only mode blocks the network,
// and debrief scoring uses the same configured provider (and redaction) as live answers, never an agent CLI.
import type { ModelCall } from '../job-view/jdStructure'
import type { AnswerProvider } from './engine'
import { LlmError, collectText } from './providers/openrouter'
import { redact } from './redact'
import type { CopilotConfig } from './types'

const SCORE_SYSTEM = 'Score interview answers.'
const SCORE_MAX_TOKENS = 900
const SCORE_TIMEOUT_MS = 30_000

/** The setting is read on every request, so turning local-only on takes effect immediately. */
export function blockWhenLocalOnly(inner: AnswerProvider, isLocalOnly: () => boolean): AnswerProvider {
  return {
    id: inner.id,
    stream: p => {
      if (isLocalOnly()) throw new LlmError('bad_request', 'Local-only mode is on: no interview text leaves this computer')
      return inner.stream(p)
    },
  }
}

export function createScoreCall(d: { provider: () => AnswerProvider; config: () => CopilotConfig; model: () => string }): ModelCall {
  return async prompt => {
    const model = d.model()
    const r = await collectText(d.provider(), {
      system: SCORE_SYSTEM, messages: [{ role: 'user', content: d.config().privacy.redact ? redact(prompt) : prompt }], model,
      maxTokens: SCORE_MAX_TOKENS, signal: AbortSignal.timeout(SCORE_TIMEOUT_MS),
    })
    return { text: r.text, tokens: r.usage ? r.usage.promptTokens + r.usage.completionTokens : null, model }
  }
}
