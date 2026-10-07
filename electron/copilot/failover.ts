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
export async function* withFailover<T>(models: readonly string[], run: (model: string, models: readonly string[]) => AsyncIterable<T>, opts: FailoverOptions = {}): AsyncGenerator<T> {
  if (models.length === 0) throw new LlmError('bad_request', 'No model is selected')
  const max = opts.maxAttempts ?? 3
  const sleep = opts.sleep ?? sleepMs
  for (let attempt = 1; ; attempt++) {
    const model = models[(attempt - 1) % models.length]!
    let started = false
    try {
      for await (const item of run(model, models)) { started = true; yield item }
      return
    } catch (e) {
      if (started || !(e instanceof LlmError) || !e.retryable || attempt >= max || opts.signal?.aborted) throw e
      opts.onRetry?.({ attempt, from: model, to: models[attempt % models.length]!, code: e.code })
      // Back off only when the same endpoint is hit again or it said "slow down": a different model after an empty, malformed or failed reply goes out at once.
      const wait = models.length > 1 && e.code !== 'rate_limit' ? 0 : (opts.baseDelayMs ?? 250) * 2 ** (attempt - 1)
      if (wait > 0) await sleep(wait, opts.signal)
      if (opts.signal?.aborted) throw new LlmError('aborted', 'Cancelled')
    }
  }
}

/**
 * Hedged request: if `call(primary)` has produced nothing after `afterMs`, also start `call(backup)`. The first to yield wins and the
 * loser is aborted. A call that fails before yielding is dropped; the error is thrown only once every call has failed (so failover
 * sees it as usual). `call` must honour the signal it is given.
 */
export async function* withHedge<T>(primary: string, backup: string | undefined, call: (model: string, signal: AbortSignal) => AsyncIterable<T>, o: { afterMs: number; signal: AbortSignal; onWin?: (model: string) => void; onHedge?: (backup: string) => void }): AsyncGenerator<T> {
  type Kid = { model: string; ac: AbortController; it: AsyncIterator<T>; next?: Promise<{ k: Kid; r: IteratorResult<T> } | { k: Kid; e: unknown }> }
  const kids: Kid[] = []
  const launch = (model: string): void => {
    const ac = new AbortController()
    o.signal.addEventListener('abort', () => ac.abort(), { once: true })
    const k: Kid = { model, ac, it: call(model, ac.signal)[Symbol.asyncIterator]() }
    k.next = k.it.next().then(r => ({ k, r }), e => ({ k, e }))
    kids.push(k)
  }
  let timer: ReturnType<typeof setTimeout> | undefined
  const hedge = backup && o.afterMs > 0 ? new Promise<'hedge'>(res => { timer = setTimeout(() => res('hedge'), o.afterMs) }) : null
  let failure: unknown
  let winner: { k: Kid; first: T } | null = null
  launch(primary)
  try {
    while (!winner) {
      const live = kids.flatMap(k => (k.next ? [k.next] : []))
      if (!live.length) throw failure
      const ev = await Promise.race(hedge && kids.length < 2 ? [...live, hedge] : live)
      if (ev === 'hedge') { o.onHedge?.(backup!); launch(backup!); continue }
      ev.k.next = undefined
      if ('e' in ev) failure ??= ev.e
      else if (ev.r.done) failure ??= new LlmError('server', `${ev.k.model} returned an empty answer`)
      else winner = { k: ev.k, first: ev.r.value }
    }
    for (const k of kids) if (k !== winner.k) k.ac.abort() // the loser stops and costs nothing more
    o.onWin?.(winner.k.model)
    yield winner.first
    for (;;) { const r = await winner.k.it.next(); if (r.done) return; yield r.value }
  } finally {
    clearTimeout(timer)
    for (const k of kids) k.ac.abort()
  }
}
