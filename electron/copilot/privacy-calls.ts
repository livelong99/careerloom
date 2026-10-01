// Two main-side privacy guarantees for every model call the copilot makes (plan §9): local-only mode blocks the network,
// and debrief scoring uses the same configured provider (and redaction) as live answers, never an agent CLI.
import type { ModelCall } from '../job-view/jdStructure'
import type { AnswerProvider } from './engine'
import { LlmError, collectText } from './providers/openrouter'
import { createRedactor } from './redact'
import type { CopilotConfig } from './types'

/** Masks transcript text before any model call while `privacy.redact` is on (read per call). */
export const redactIfOn = (config: () => CopilotConfig, names: () => string[] = () => []): ((text: string) => string) =>
  text => (config().privacy.redact ? createRedactor(names())(text) : text)

/** The candidate's own name from the top of cv.md ("# Name" or a short first line): spoken back by the interviewer, so it is masked too. */
export function nameFromCv(cv: string): string[] {
  const first = cv.split('\n').map(l => l.replace(/^#+\s*/, '').trim()).find(Boolean) ?? ''
  const words = first.split(/\s+/)
  if (words.length > 4 || first.length > 40 || !words.every(w => /^\p{Lu}[\p{L}'.-]*$/u.test(w))) return []
  return [first, ...words.filter(w => w.length > 2)]
}

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
    warm: async () => { if (!isLocalOnly()) await inner.warm?.() },
  }
}

export function createScoreCall(d: { provider: () => AnswerProvider; config: () => CopilotConfig; model: () => string; names?: () => string[] }): ModelCall {
  const mask = redactIfOn(d.config, d.names)
  return async prompt => {
    const model = d.model()
    const r = await collectText(d.provider(), {
      system: SCORE_SYSTEM, messages: [{ role: 'user', content: mask(prompt) }], model,
      maxTokens: SCORE_MAX_TOKENS, signal: AbortSignal.timeout(SCORE_TIMEOUT_MS),
    })
    return { text: r.text, tokens: r.usage ? r.usage.promptTokens + r.usage.completionTokens : null, model }
  }
}
