// @vitest-environment node
import { describe, expect, it, vi } from 'vitest'
import { createOpenRouterEngine } from './openrouter'

const SECRET = 'sk-or-v1-supersecretvalue1234'
const body = (...parts: number[][]) => new ReadableStream<Uint8Array>({ start(c) { parts.forEach(p => c.enqueue(new Uint8Array(p))); c.close() } })
const drain = async (it: AsyncIterable<{ pcm16: ArrayBuffer }>) => { const out: number[][] = []; for await (const c of it) out.push([...new Uint8Array(c.pcm16)]); return out }

describe('openrouter tts engine', () => {
  it('posts one sentence with pcm output, bearer key and no key in the body', async () => {
    const fetch = vi.fn(async (_u: string, _i: RequestInit) => new Response(body([1, 0, 2, 0]), { status: 200 }))
    const e = createOpenRouterEngine({ getKey: () => SECRET, fetch: fetch as never })
    await drain(e.synth('Hello there.', 'af_heart', 1.25, new AbortController().signal))
    const [url, init] = fetch.mock.calls[0]
    expect(url).toBe('https://openrouter.ai/api/v1/audio/speech')
    expect((init.headers as Record<string, string>).authorization).toBe(`Bearer ${SECRET}`)
    expect(JSON.parse(init.body as string)).toMatchObject({ input: 'Hello there.', voice: 'af_heart', response_format: 'pcm', speed: 1.25 })
    expect(init.body as string).not.toContain(SECRET)
  })
  it('re-aligns chunks to whole 16-bit samples', async () => {
    const e = createOpenRouterEngine({ getKey: () => SECRET, fetch: (async () => new Response(body([1], [0, 2], [0, 3, 0]), { status: 200 })) as never })
    const out = await drain(e.synth('x y z', 'v', 1, new AbortController().signal))
    expect(out.flat()).toEqual([1, 0, 2, 0, 3, 0])
    expect(out.every(c => c.length % 2 === 0)).toBe(true)
  })
  it('no key → clear error, no request', async () => {
    const fetch = vi.fn()
    const e = createOpenRouterEngine({ getKey: () => null, fetch: fetch as never })
    await expect(drain(e.synth('x', 'v', 1, new AbortController().signal))).rejects.toThrow(/key/i)
    expect(fetch).not.toHaveBeenCalled()
    expect(await e.voices()).toEqual([])
  })
  it('http errors are typed, scrubbed and never contain the key', async () => {
    const e = createOpenRouterEngine({ getKey: () => SECRET, fetch: (async () => new Response(`bad key ${SECRET}`, { status: 401 })) as never })
    const err = await drain(e.synth('x', 'v', 1, new AbortController().signal)).catch(x => x as Error)
    expect(String((err as Error).message)).toMatch(/401/); expect(String((err as Error).message)).not.toContain(SECRET)
  })
  it('lists Kokoro voices as installed only when a key exists', async () => {
    const e = createOpenRouterEngine({ getKey: () => SECRET, fetch: vi.fn() as never })
    const v = await e.voices()
    expect(v.length).toBeGreaterThan(0); expect(v.every(x => x.engine === 'openrouter' && x.installed && !x.offline)).toBe(true)
  })
  it('abort stops without yielding', async () => {
    const ac = new AbortController(); ac.abort()
    const e = createOpenRouterEngine({ getKey: () => SECRET, fetch: (async (_u: string, i: RequestInit) => { if (i.signal?.aborted) throw new DOMException('aborted', 'AbortError'); return new Response(body([1, 0])) }) as never })
    expect(await drain(e.synth('x y', 'v', 1, ac.signal))).toEqual([])
  })
})
