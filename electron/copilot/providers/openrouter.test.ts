import { describe, expect, it } from 'vitest'
import { collectText, createOpenRouter, decodeStream, LlmError, parseSse, toModelInfo } from './openrouter'

const enc = new TextEncoder()
async function* chunks(parts: Array<string | Uint8Array>) { for (const p of parts) yield typeof p === 'string' ? enc.encode(p) : p }
async function all<T>(it: AsyncIterable<T>): Promise<T[]> { const out: T[] = []; for await (const x of it) out.push(x); return out }
const data = (o: unknown) => `data: ${JSON.stringify(o)}\n\n`
const delta = (t: string) => data({ choices: [{ delta: { content: t }, finish_reason: null }] })

describe('parseSse', () => {
  it('skips comment lines and joins multi-line data', async () => {
    const out = await all(parseSse(chunks([': OPENROUTER PROCESSING\n\ndata: a\ndata: b\n\n: keepalive\n\ndata: c\n\n'])))
    expect(out).toEqual(['a\nb', 'c'])
  })
  it('handles events split at every byte, CRLF, and multi-byte characters', async () => {
    const raw = enc.encode(`: OPENROUTER PROCESSING\r\n\r\ndata: héllo 🙂\r\n\r\ndata: [DONE]\r\n\r\n`)
    const out = await all(parseSse(chunks(Array.from(raw, b => new Uint8Array([b])))))
    expect(out).toEqual(['héllo 🙂', '[DONE]'])
  })
  it('flushes a final event with no trailing blank line', async () => {
    expect(await all(parseSse(chunks(['data: tail'])))).toEqual(['tail'])
  })
  it('accepts "data:" without a space', async () => {
    expect(await all(parseSse(chunks(['data:x\n\n'])))).toEqual(['x'])
  })
})

describe('decodeStream', () => {
  const run = (parts: string[]) => all(decodeStream(parseSse(chunks(parts))))
  it('yields deltas, then usage, and stops at [DONE]', async () => {
    const out = await run([
      ': OPENROUTER PROCESSING\n\n', delta('Hel'), delta('lo'),
      data({ choices: [], usage: { prompt_tokens: 12, completion_tokens: 3, cost: 0.0001 } }),
      'data: [DONE]\n\n', delta('ignored'),
    ])
    expect(out).toEqual([{ delta: 'Hel' }, { delta: 'lo' }, { usage: { promptTokens: 12, completionTokens: 3, costUsd: 0.0001 } }])
  })
  it('survives a JSON payload fragmented across chunks', async () => {
    const whole = delta('split')
    const out = await run([whole.slice(0, 17), whole.slice(17, 40), whole.slice(40)])
    expect(out).toEqual([{ delta: 'split' }])
  })
  it('skips empty and role-only deltas', async () => {
    const out = await run([data({ choices: [{ delta: { role: 'assistant', content: '' } }] }), delta('x')])
    expect(out).toEqual([{ delta: 'x' }])
  })
  it('throws a typed error for a mid-stream error event (HTTP was 200)', async () => {
    await expect(run([delta('a'), data({ error: { code: 429, message: 'slow down' }, choices: [{ finish_reason: 'error', delta: { content: '' } }] })]))
      .rejects.toMatchObject({ name: 'LlmError', code: 'rate_limit', retryable: true })
  })
  it('throws on finish_reason error without an error body', async () => {
    await expect(run([data({ choices: [{ finish_reason: 'error', delta: { content: '' } }] })])).rejects.toMatchObject({ code: 'stream' })
  })
  it('throws on malformed JSON', async () => {
    await expect(run(['data: {not json\n\n'])).rejects.toBeInstanceOf(LlmError)
  })
})

function fakeFetch(body: string[], init: { status?: number; json?: unknown; hang?: boolean } = {}) {
  const calls: Array<{ url: string; init: RequestInit }> = []
  const f = (async (url: string, req: RequestInit) => {
    calls.push({ url, init: req })
    if (init.json !== undefined || (init.status && init.status >= 400)) return new Response(JSON.stringify(init.json ?? { error: { message: 'boom' } }), { status: init.status ?? 200 })
    const signal = req.signal as AbortSignal
    const stream = new ReadableStream<Uint8Array>({
      async start(c) {
        for (const p of body) {
          if (signal.aborted) return c.error(new DOMException('aborted', 'AbortError'))
          c.enqueue(enc.encode(p)); await new Promise(r => setTimeout(r, 2))
        }
        if (init.hang) await new Promise<void>(res => signal.addEventListener('abort', () => { c.error(new DOMException('aborted', 'AbortError')); res() }))
        else c.close()
      },
    })
    return new Response(stream, { status: 200 })
  }) as unknown as typeof fetch
  return { f, calls }
}
const cfg = { dataCollection: 'deny', zdr: false, sort: 'latency', policyMigrated: true } as const
const prompt = (signal = new AbortController().signal) => ({ system: 'sys', messages: [{ role: 'user' as const, content: 'hi' }], model: 'anthropic/claude-haiku-4.5', signal })

describe('createOpenRouter', () => {
  it('streams text and sends privacy routing, key and cache control', async () => {
    const { f, calls } = fakeFetch([delta('ok'), data({ choices: [], usage: { prompt_tokens: 5, completion_tokens: 1 } }), 'data: [DONE]\n\n'])
    const p = createOpenRouter({ getKey: () => 'sk-or-test', fetch: f, config: () => cfg })
    expect(await all(p.stream(prompt()))).toEqual([{ delta: 'ok' }, { usage: { promptTokens: 5, completionTokens: 1, costUsd: null } }])
    const body = JSON.parse(calls[0]!.init.body as string)
    expect(body).toMatchObject({ stream: true, model: 'anthropic/claude-haiku-4.5', provider: { data_collection: 'deny', sort: 'latency' }, usage: { include: true } })
    expect(body.messages[0]).toMatchObject({ role: 'system', content: [{ type: 'text', text: 'sys', cache_control: { type: 'ephemeral' } }] })
    expect((calls[0]!.init.headers as Record<string, string>).Authorization).toBe('Bearer sk-or-test')
  })
  it('does not add cache_control for non-Anthropic models', async () => {
    const { f, calls } = fakeFetch(['data: [DONE]\n\n'])
    await all(createOpenRouter({ getKey: () => 'k', fetch: f, config: () => cfg }).stream({ ...prompt(), model: 'openai/gpt-4.1-nano' }))
    expect(JSON.parse(calls[0]!.init.body as string).messages[0]).toEqual({ role: 'system', content: 'sys' })
  })
  it('refuses without a key, before any network call', async () => {
    const { f, calls } = fakeFetch([])
    await expect(all(createOpenRouter({ getKey: () => null, fetch: f, config: () => cfg }).stream(prompt()))).rejects.toMatchObject({ code: 'no_key' })
    expect(calls).toHaveLength(0)
  })
  it.each([[401, 'auth', false], [402, 'credits', false], [429, 'rate_limit', true], [503, 'server', true], [400, 'bad_request', false]])('maps HTTP %i to %s', async (status, code, retryable) => {
    const { f } = fakeFetch([], { status })
    await expect(all(createOpenRouter({ getKey: () => 'k', fetch: f, config: () => cfg }).stream(prompt()))).rejects.toMatchObject({ code, retryable })
  })
  it('maps the OpenRouter data-policy 404 to policy, other 404s to model_unavailable (not retried)', async () => {
    const policy = fakeFetch([], { status: 404, json: { error: { code: 404, message: 'No endpoints found matching your data policy (Free model training). Configure: https://openrouter.ai/settings/privacy' } } })
    await expect(all(createOpenRouter({ getKey: () => 'k', fetch: policy.f, config: () => cfg }).stream(prompt()))).rejects.toMatchObject({ code: 'policy', retryable: false })
    const gone = fakeFetch([], { status: 404, json: { error: { message: 'No endpoints found for acme/gone.' } } })
    await expect(all(createOpenRouter({ getKey: () => 'k', fetch: gone.f, config: () => cfg }).stream(prompt()))).rejects.toMatchObject({ code: 'model_unavailable', retryable: false })
  })
  it('scrubs keys out of error messages', async () => {
    const { f } = fakeFetch([], { status: 401, json: { error: { message: 'bad key sk-or-v1-abcdef1234567890 Bearer xyz' } } })
    const err = await all(createOpenRouter({ getKey: () => 'k', fetch: f, config: () => cfg }).stream(prompt())).catch(e => e as Error)
    expect((err as Error).message).not.toMatch(/sk-or-v1-abcdef|xyz/)
  })
  it('aborts mid-stream with a typed aborted error and stops reading', async () => {
    const { f } = fakeFetch([delta('a'), delta('b')], { hang: true })
    const ac = new AbortController()
    const got: unknown[] = []
    const run = (async () => { for await (const x of createOpenRouter({ getKey: () => 'k', fetch: f, config: () => cfg }).stream(prompt(ac.signal))) { got.push(x); ac.abort() } })()
    await expect(run).rejects.toMatchObject({ code: 'aborted', retryable: false })
    expect(got.length).toBeGreaterThan(0)
  })
  it('times out a stalled request', async () => {
    const { f } = fakeFetch([], { hang: true })
    const p = createOpenRouter({ getKey: () => 'k', fetch: f, config: () => cfg, firstByteTimeoutMs: 20, idleTimeoutMs: 20 })
    await expect(collectText(p, prompt())).rejects.toMatchObject({ code: 'timeout', retryable: true })
  })
})

describe('toModelInfo', () => {
  it('maps the OpenRouter models payload to per-million prices', () => {
    expect(toModelInfo({ id: 'a/b', name: 'A: B', context_length: 1000, pricing: { prompt: '0.0000001', completion: '0.0000004' } }))
      .toEqual({ id: 'a/b', name: 'A: B', contextTokens: 1000, promptUsdPerM: 0.1, completionUsdPerM: 0.4, dataPolicy: 'unknown', supportsStreaming: true })
  })
  it('marks free models (":free" id or zero price) as may-collect; paid stay unknown because the list cannot tell', () => {
    expect(toModelInfo({ id: 'q/x:free', pricing: { prompt: '0', completion: '0' } }).dataPolicy).toBe('may-collect')
    expect(toModelInfo({ id: 'q/y', pricing: { prompt: 0, completion: 0 } }).dataPolicy).toBe('may-collect')
    expect(toModelInfo({ id: 'q/z', pricing: { prompt: '0.000001', completion: '0.000002' } }).dataPolicy).toBe('unknown')
  })
  it('keeps unknown prices null', () => {
    expect(toModelInfo({ id: 'x', name: 'x', pricing: {} })).toMatchObject({ contextTokens: null, promptUsdPerM: null })
  })
})

describe('reasoning parameter (PERF-1)', () => {
  const body = (c: { init: RequestInit }) => JSON.parse(c.init.body as string)
  const stream = (model: string, f: typeof fetch) => all(createOpenRouter({ getKey: () => 'k', fetch: f, config: () => cfg }).stream({ ...prompt(), model }))
  /** Rejects any request whose body fails `ok`, with the 400 OpenRouter sends for mandatory-reasoning models. */
  function picky(ok: (b: Record<string, unknown>) => boolean) {
    const calls: Array<Record<string, unknown>> = []
    const f = (async (_u: string, req: RequestInit) => {
      const b = JSON.parse(req.body as string) as Record<string, unknown>
      calls.push(b)
      if (!ok(b)) return new Response(JSON.stringify({ error: { message: 'Reasoning is mandatory for this endpoint and cannot be disabled.' } }), { status: 400 })
      return new Response(new ReadableStream({ start(c) { c.enqueue(enc.encode(delta('ok') + 'data: [DONE]\n\n')); c.close() } }), { status: 200 })
    }) as unknown as typeof fetch
    return { f, calls }
  }
  it('never sends reasoning:{enabled:false} to a non-reasoning model (field omitted)', async () => {
    const { f, calls } = fakeFetch(['data: [DONE]\n\n'])
    await stream('openai/gpt-4.1-nano', f)
    expect('reasoning' in body(calls[0]!)).toBe(false)
  })
  it('asks mandatory-reasoning families for minimal effort, not "disabled"', async () => {
    const { f, calls } = fakeFetch(['data: [DONE]\n\n'])
    await stream('openai/gpt-5.4-mini', f)
    expect(body(calls[0]!).reasoning).toEqual({ effort: 'minimal' })
  })
  it('on a reasoning 400 walks the ladder, then remembers what the model accepted', async () => {
    const { f, calls } = picky(b => JSON.stringify(b.reasoning) === JSON.stringify({ effort: 'low' }))
    const p = createOpenRouter({ getKey: () => 'k', fetch: f, config: () => cfg })
    await all(p.stream({ ...prompt(), model: 'acme/thinker-9' }))
    expect(calls.map(c => c.reasoning)).toEqual([undefined, { effort: 'minimal' }, { effort: 'low' }])
    await all(p.stream({ ...prompt(), model: 'acme/thinker-9' }))
    expect(calls[3]!.reasoning).toEqual({ effort: 'low' }) // learned: a single request next time
    expect(calls).toHaveLength(4)
  })
  it('stops after the ladder is exhausted and surfaces the error', async () => {
    const { f, calls } = picky(() => false)
    await expect(stream('acme/never', f)).rejects.toMatchObject({ code: 'bad_request' })
    expect(calls).toHaveLength(4)
  })
  it('does not retry unrelated 400s', async () => {
    const { f, calls } = fakeFetch([], { status: 400, json: { error: { message: 'max_tokens too large' } } })
    await expect(stream('openai/gpt-5.4-mini', f)).rejects.toMatchObject({ code: 'bad_request' })
    expect(calls).toHaveLength(1)
  })
})

describe('prompt caching, sticky routing, warm-up, marks (PERF-1)', () => {
  it('marks explicit-cache providers (anthropic, qwen) only', async () => {
    for (const [model, marked] of [['qwen/qwen3-30b-a3b-instruct-2507', true], ['google/gemini-3.6-flash', false], ['openai/gpt-4.1-mini', false]] as const) {
      const { f, calls } = fakeFetch(['data: [DONE]\n\n'])
      await all(createOpenRouter({ getKey: () => 'k', fetch: f, config: () => cfg }).stream({ ...prompt(), model }))
      expect(Array.isArray(JSON.parse(calls[0]!.init.body as string).messages[0].content)).toBe(marked)
    }
  })
  it('sends session_id for sticky routing only when given', async () => {
    const a = fakeFetch(['data: [DONE]\n\n']); const b = fakeFetch(['data: [DONE]\n\n'])
    await all(createOpenRouter({ getKey: () => 'k', fetch: a.f, config: () => cfg }).stream({ ...prompt(), sessionId: 's-1' }))
    await all(createOpenRouter({ getKey: () => 'k', fetch: b.f, config: () => cfg }).stream(prompt()))
    expect(JSON.parse(a.calls[0]!.init.body as string).session_id).toBe('s-1')
    expect('session_id' in JSON.parse(b.calls[0]!.init.body as string)).toBe(false)
  })
  it('reports cached prompt tokens from usage.prompt_tokens_details', async () => {
    const { f } = fakeFetch([data({ choices: [], usage: { prompt_tokens: 6000, completion_tokens: 80, prompt_tokens_details: { cached_tokens: 5400 } } }), 'data: [DONE]\n\n'])
    const out = await all(createOpenRouter({ getKey: () => 'k', fetch: f, config: () => cfg }).stream(prompt()))
    expect(out[0]).toMatchObject({ usage: { promptTokens: 6000, cachedTokens: 5400 } })
  })
  it('fires request-sent then first-byte marks', async () => {
    const { f } = fakeFetch([delta('a'), 'data: [DONE]\n\n'])
    const marks: string[] = []
    await all(createOpenRouter({ getKey: () => 'k', fetch: f, config: () => cfg }).stream({ ...prompt(), onMark: m => marks.push(m) }))
    expect(marks).toEqual(['request-sent', 'first-byte'])
  })
  it('warm() makes one tokenless GET to the same host and never throws', async () => {
    const calls: Array<{ url: string; method?: string }> = []
    const f = (async (url: string, init: RequestInit) => { calls.push({ url, method: init.method }); return new Response('{}', { status: 200 }) }) as unknown as typeof fetch
    await createOpenRouter({ getKey: () => 'k', fetch: f, config: () => cfg, baseUrl: 'https://x.test/api/v1' }).warm!()
    expect(calls).toEqual([{ url: 'https://x.test/api/v1/key', method: 'GET' }])
    const boom = (async () => { throw new Error('offline') }) as unknown as typeof fetch
    await expect(createOpenRouter({ getKey: () => 'k', fetch: boom, config: () => cfg }).warm!()).resolves.toBeUndefined()
    const none = createOpenRouter({ getKey: () => null, fetch: f, config: () => cfg })
    await none.warm!(); expect(calls).toHaveLength(1) // no key, no request
  })
})
