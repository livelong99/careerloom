// Ported from Open-Cluely (owner's project), adapted for Careerloom: main-process/features/assistant/gemini-runtime.js
// rotates API keys when one is exhausted. Here there is one OpenRouter key, so the unit that rotates is the model;
// the decision uses typed error codes (LlmError.code), never message substrings.
import { LlmError } from './providers/openrouter'

export type FailoverOptions = {
  maxAttempts?: number
  baseDelayMs?: number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  onRetry?: (info: { attempt: number; from: string; to: string; code: string }) => void
  signal?: AbortSignal
}

const sleepMs = (ms: number, signal?: AbortSignal) => new Promise<void>(resolve => {
  const t = setTimeout(resolve, ms)
  signal?.addEventListener('abort', () => { clearTimeout(t); resolve() }, { once: true })
})

/** Primary first, then distinct fallbacks. */
export const modelOrder = (primary: string, fallbacks: readonly string[]): string[] => [...new Set([primary, ...fallbacks])]

/**
 * Runs `run(model)`; if it fails with a retryable LlmError before yielding anything, backs off and tries the next model
 * (cycling when there is only one). An error after output started is thrown as is: replaying would duplicate text the
 * user is already reading. Non-retryable codes (auth, credits, aborted, bad_request, budget) are never retried.
 */
export async function* withFailover<T>(models: readonly string[], run: (model: string) => AsyncIterable<T>, opts: FailoverOptions = {}): AsyncGenerator<T> {
  if (models.length === 0) throw new LlmError('bad_request', 'No model is selected')
  const max = opts.maxAttempts ?? 3
  const sleep = opts.sleep ?? sleepMs
  for (let attempt = 1; ; attempt++) {
    const model = models[(attempt - 1) % models.length]!
    let started = false
    try {
      for await (const item of run(model)) { started = true; yield item }
      return
    } catch (e) {
      if (started || !(e instanceof LlmError) || !e.retryable || attempt >= max || opts.signal?.aborted) throw e
      opts.onRetry?.({ attempt, from: model, to: models[attempt % models.length]!, code: e.code })
      await sleep((opts.baseDelayMs ?? 250) * 2 ** (attempt - 1), opts.signal)
      if (opts.signal?.aborted) throw new LlmError('aborted', 'Cancelled')
    }
  }
}
