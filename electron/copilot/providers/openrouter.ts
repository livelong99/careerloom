// SSE streaming client for OpenRouter (plan §3.4). Main process only; the key comes from safeStorage via the caller.
import type { AnswerProvider, ProviderPrompt, StreamItem, StreamUsage } from '../engine'
import type { CopilotConfig, LlmModelInfo } from '../types'
import { initialReasoning, isReasoningRejection, nextReasoning, type ReasoningShape } from './reasoning'

export type LlmErrorCode = 'no_key' | 'auth' | 'credits' | 'rate_limit' | 'timeout' | 'aborted' | 'server' | 'bad_request' | 'stream' | 'budget' | 'policy' | 'model_unavailable'
const RETRYABLE: ReadonlySet<LlmErrorCode> = new Set(['rate_limit', 'timeout', 'server'])

/** Typed so failover never matches on message substrings. `message` is safe to show (keys scrubbed). */
export class LlmError extends Error {
  override readonly name = 'LlmError'
  readonly retryable: boolean
  /** Set by the answer engine on policy/unavailable errors: a model to offer instead. Never switched to silently. */
  suggestion?: string
  constructor(readonly code: LlmErrorCode, message: string) { super(scrub(message)); this.retryable = RETRYABLE.has(code) }
}

const scrub = (s: string) => s.replace(/sk-[A-Za-z0-9_-]{6,}/g, '[key]').replace(/Bearer\s+\S+/gi, 'Bearer [key]').slice(0, 300)

/** OpenRouter answers 404 "No endpoints found matching your data policy (...)" when `provider.data_collection: deny` or the account privacy settings exclude every provider of a model (docs: guides/routing/provider-selection, features/privacy-and-logging). */
const POLICY_404 = /data policy|privacy settings/i

function codeForStatus(status: number, message = ''): LlmErrorCode {
  if (status === 404) return POLICY_404.test(message) ? 'policy' : 'model_unavailable'
  if (status === 401 || status === 403) return 'auth'
  if (status === 402) return 'credits'
  if (status === 408) return 'timeout'
  if (status === 429) return 'rate_limit'
  if (status >= 500) return 'server'
  return 'bad_request'
}

/** SSE text -> data payloads. Skips comment lines (`: OPENROUTER PROCESSING`), joins multi-line data, tolerates CRLF and any chunk split. */
export async function* parseSse(body: AsyncIterable<Uint8Array | string>): AsyncGenerator<string> {
  const dec = new TextDecoder()
  let buf = ''
  let dataLines: string[] = []
  const flush = (): string | null => { const d = dataLines.length ? dataLines.join('\n') : null; dataLines = []; return d }
  const line = (l: string): string | null => {
    if (l === '') return flush()
    if (l.startsWith(':')) return null
    const [field, ...rest] = l.split(':')
    if (field === 'data') dataLines.push(rest.join(':').replace(/^ /, ''))
    return null
  }
  for await (const chunk of body) {
    buf += typeof chunk === 'string' ? chunk : dec.decode(chunk, { stream: true })
    const lines = buf.split(/\r\n|\n|\r(?!$)/)
    buf = lines.pop() ?? ''
    for (const l of lines) { const d = line(l); if (d !== null) yield d }
  }
  buf += dec.decode()
  if (buf) line(buf)
  const tail = flush()
  if (tail !== null) yield tail
}

type Chunk = {
  choices?: Array<{ delta?: { content?: unknown }; finish_reason?: string | null }>
  error?: { code?: number | string; message?: string }
  usage?: { prompt_tokens?: number; completion_tokens?: number; cost?: number; prompt_tokens_details?: { cached_tokens?: number } }
}

/** Data payloads -> deltas and the usage chunk. Stops at `[DONE]`; mid-stream errors (HTTP stayed 200) throw. */
export async function* decodeStream(payloads: AsyncIterable<string>): AsyncGenerator<StreamItem> {
  for await (const raw of payloads) {
    if (raw.trim() === '[DONE]') return
    let c: Chunk
    try { c = JSON.parse(raw) as Chunk } catch { throw new LlmError('stream', 'The model stream sent malformed data') }
    if (c.error) throw new LlmError(typeof c.error.code === 'number' ? codeForStatus(c.error.code, c.error.message) : 'stream', c.error.message ?? 'The model stream failed')
    const choice = c.choices?.[0]
    if (choice?.finish_reason === 'error') throw new LlmError('stream', 'The model stream ended with an error')
    const text = choice?.delta?.content
    if (typeof text === 'string' && text) yield { delta: text }
    if (c.usage) {
      const cached = c.usage.prompt_tokens_details?.cached_tokens
      yield { usage: { promptTokens: c.usage.prompt_tokens ?? 0, completionTokens: c.usage.completion_tokens ?? 0, costUsd: typeof c.usage.cost === 'number' ? c.usage.cost : null, ...(typeof cached === 'number' ? { cachedTokens: cached } : {}) } }
    }
  }
}

export type OpenRouterOptions = {
  getKey: () => string | null
  config: () => CopilotConfig['engine']['openrouter']
  fetch?: typeof fetch
  baseUrl?: string
  firstByteTimeoutMs?: number
  idleTimeoutMs?: number
}
const BASE = 'https://openrouter.ai/api/v1'
const EXPLICIT_CACHE = /^(anthropic|qwen)\//

function bodyStream(res: Response): AsyncIterable<Uint8Array> {
  const reader = res.body!.getReader()
  return { [Symbol.asyncIterator]: () => ({
    async next() { const { done, value } = await reader.read(); return done ? { done: true as const, value: undefined } : { done: false as const, value } },
    async return() { await reader.cancel().catch(() => undefined); return { done: true as const, value: undefined } },
  }) }
}

export function createOpenRouter(opts: OpenRouterOptions): AnswerProvider {
  const doFetch = opts.fetch ?? fetch
  const base = opts.baseUrl ?? BASE
  const firstByte = opts.firstByteTimeoutMs ?? 15_000
  const idle = opts.idleTimeoutMs ?? 20_000
  const learned = new Map<string, ReasoningShape>() // reasoning shape each model accepted
  return {
    id: 'openrouter',
    /** Zero-token request to the same host: opens DNS + TLS (and the keep-alive socket) before the first real answer. Never throws. */
    async warm() {
      const key = opts.getKey()
      if (!key) return
      try { const r = await doFetch(`${base}/key`, { method: 'GET', headers: { Authorization: `Bearer ${key}` }, signal: AbortSignal.timeout(5000) }); await r.arrayBuffer().catch(() => undefined) } catch { /* best effort */ }
    },
    async *stream(p: ProviderPrompt): AsyncGenerator<StreamItem> {
      const key = opts.getKey()
      if (!key) throw new LlmError('no_key', 'Add your OpenRouter key in Settings first')
      const or = opts.config()
      // Anthropic models cache the stable prefix when it is marked; other providers ignore the field, so only send it where it matters.
      // Docs (openrouter.ai/docs/features/prompt-caching): Anthropic and Qwen need an explicit cache_control block; OpenAI, Gemini 2.5+, DeepSeek, Grok cache a stable prefix implicitly (>=1024 tokens), so the prefix ordering in prompts.ts is what matters there.
      const system = EXPLICIT_CACHE.test(p.model) ? [{ type: 'text', text: p.system, cache_control: { type: 'ephemeral' } }] : p.system
      const makeBody = (reasoning: ReasoningShape) => ({
        model: p.model, stream: true, usage: { include: true }, temperature: 0.3, max_tokens: p.maxTokens ?? 700,
        ...(reasoning ? { reasoning } : {}),
        // sticky routing: one session id keeps follow-up turns on the endpoint that holds the warm cache
        ...(p.sessionId ? { session_id: p.sessionId } : {}),
        provider: { data_collection: or.dataCollection, sort: or.sort, ...(or.zdr ? { zdr: true } : {}) },
        messages: [{ role: 'system', content: system }, ...p.messages],
      })
      // One controller cancels the request for the caller's abort, a stalled connect, or a stalled stream.
      const ac = new AbortController()
      let timedOut = false
      let timer: ReturnType<typeof setTimeout> | undefined
      const arm = (ms: number) => { clearTimeout(timer); timer = setTimeout(() => { timedOut = true; ac.abort() }, ms) }
      const onAbort = () => ac.abort()
      if (p.signal.aborted) throw new LlmError('aborted', 'Cancelled')
      p.signal.addEventListener('abort', onAbort, { once: true })
      const fail = (e: unknown): never => {
        if (e instanceof LlmError) throw e
        if (p.signal.aborted) throw new LlmError('aborted', 'Cancelled')
        if (timedOut) throw new LlmError('timeout', 'The model took too long to respond')
        throw new LlmError('server', e instanceof Error ? e.message : 'Network error')
      }
      try {
        arm(firstByte)
        let res: Response
        const tried: ReasoningShape[] = []
        let shape = learned.has(p.model) ? learned.get(p.model)! : initialReasoning(p.model)
        for (;;) {
          tried.push(shape)
          p.onMark?.('request-sent')
          try {
            res = await doFetch(`${base}/chat/completions`, { method: 'POST', signal: ac.signal, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Careerloom' }, body: JSON.stringify(makeBody(shape)) })
          } catch (e) { return fail(e) }
          if (res.ok && res.body) { learned.set(p.model, shape); break }
          const j = await res.json().catch(() => null) as { error?: { message?: string } } | null
          const msg = j?.error?.message
          const next = isReasoningRejection(res.status, msg ?? '') ? nextReasoning(tried) : undefined
          if (next === undefined) throw new LlmError(codeForStatus(res.status, msg), msg ?? `OpenRouter returned ${res.status}`)
          shape = next // this model refuses that reasoning shape: retry with the next one (no tokens were generated)
        }
        const beat = async function* (src: AsyncIterable<Uint8Array>) { let first = true; for await (const c of src) { arm(idle); if (first) { first = false; p.onMark?.('first-byte') } yield c } }
        try {
          for await (const item of decodeStream(parseSse(beat(bodyStream(res))))) yield item
        } catch (e) { fail(e) }
      } finally {
        clearTimeout(timer)
        p.signal.removeEventListener('abort', onAbort)
        ac.abort() // frees the socket when the consumer stops early
      }
    },
  }
}

/** Whole answer as text (classify calls, model test). */
export async function collectText(provider: AnswerProvider, prompt: ProviderPrompt): Promise<{ text: string; usage: StreamUsage | null }> {
  let text = ''
  let usage = null as StreamUsage | null
  for await (const it of provider.stream(prompt)) { if ('delta' in it) text += it.delta; else usage = it.usage }
  return { text, usage }
}

type RawModel = { id: string; name?: string; context_length?: number | null; pricing?: { prompt?: string | number; completion?: string | number } }
const perM = (v: unknown): number | null => { const n = typeof v === 'string' || typeof v === 'number' ? Number(v) : NaN; return Number.isFinite(n) ? Math.round(n * 1e6 * 1e6) / 1e6 : null }

/** Neither /models nor /models/:id/endpoints exposes a data-policy field, so the only static signal is "free": OpenRouter's privacy settings treat free endpoints separately because they may train on prompts. Paid models stay 'unknown' until a probe says otherwise. */
export const isFreeModel = (id: string, prompt: number | null, completion: number | null): boolean => id.endsWith(':free') || (prompt === 0 && completion === 0)

export function toModelInfo(m: RawModel): LlmModelInfo {
  const promptUsdPerM = perM(m.pricing?.prompt)
  const completionUsdPerM = perM(m.pricing?.completion)
  return { id: m.id, name: m.name ?? m.id, contextTokens: m.context_length ?? null, promptUsdPerM, completionUsdPerM, dataPolicy: isFreeModel(m.id, promptUsdPerM, completionUsdPerM) ? 'may-collect' : 'unknown', supportsStreaming: true }
}

/** The public model list needs no key. */
export async function fetchModels(f: typeof fetch = fetch, base = BASE): Promise<LlmModelInfo[]> {
  const res = await f(`${base}/models`, { signal: AbortSignal.timeout(10_000) })
  if (!res.ok) throw new LlmError(codeForStatus(res.status), `OpenRouter returned ${res.status}`)
  const j = await res.json() as { data?: RawModel[] }
  return (j.data ?? []).filter(m => typeof m.id === 'string' && !m.id.endsWith(':batch')).map(toModelInfo)
}
