// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { TtsAudioMsg } from '../kb/types'
import { createFakeTts } from './fake'
import { buildChain, createTtsService } from './service'

beforeEach(() => { vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

const setup = (engines = [createFakeTts({ latencyMs: 100 })], extra: Partial<Parameters<typeof createTtsService>[0]> = {}) => {
  const sent: TtsAudioMsg[] = []
  const fallbacks: string[] = []
  const svc = createTtsService({
    chain: () => engines, voice: () => ({ voiceId: 'v-sel', speed: 1.1 }),
    send: m => sent.push(m), onFallback: (f, t) => fallbacks.push(`${f}>${t}`), ...extra,
  })
  return { svc, sent, fallbacks, engines }
}

describe('tts service', () => {
  it('renders sentences in order with increasing seq; end() emits one last marker after all audio', async () => {
    const { svc, sent, engines } = setup()
    svc.speak('u1', 'First sentence here.'); svc.speak('u1', 'Second sentence here.'); svc.end('u1')
    await vi.runAllTimersAsync()
    expect(sent.map(m => [m.utteranceId, m.seq, m.last, m.pcm16.byteLength > 0])).toEqual([['u1', 0, false, true], ['u1', 1, false, true], ['u1', 2, true, false]])
    expect(engines[0].calls.map(c => c.text)).toEqual(['First sentence here.', 'Second sentence here.'])
    expect(engines[0].calls[0]).toMatchObject({ voiceId: 'v-sel', speed: 1.1 })
  })
  it('starts rendering sentence N+1 as soon as N is rendered (prefetch), not when N finishes playing', async () => {
    const { svc, sent } = setup([createFakeTts({ latencyMs: 100, msPerChar: 100 })]) // each sentence ≈ 2 s of audio
    svc.speak('u', 'Twenty characters!!!'); svc.speak('u', 'Another twenty chars.')
    await vi.advanceTimersByTimeAsync(201)
    expect(sent.length).toBe(2) // both rendered by 0.2 s although 4 s of audio is yet to play
  })
  it('cancel() aborts synthesis, drops the queue and tells the renderer in the same tick (< 50 ms)', async () => {
    const { svc, sent, engines } = setup([createFakeTts({ latencyMs: 1000 })])
    svc.speak('u', 'This one is mid render.'); svc.speak('u', 'This one is still queued.')
    await vi.advanceTimersByTimeAsync(10)
    const t0 = Date.now()
    svc.cancel()
    expect(Date.now() - t0).toBeLessThan(50)
    expect(sent).toEqual([{ utteranceId: 'u', seq: -1, pcm16: expect.any(ArrayBuffer), sampleRate: 24000, last: true }])
    await vi.runAllTimersAsync()
    expect(engines[0].calls.length).toBe(1) // queued sentence never rendered
    expect(sent.length).toBe(1) // aborted render emits nothing
  })
  it('cancel() after rendering finished still tells the renderer (buffered audio is still playing)', async () => {
    const { svc, sent } = setup()
    svc.speak('u', 'Rendered long before the cancel.'); await vi.runAllTimersAsync()
    svc.cancel()
    expect(sent.at(-1)).toMatchObject({ utteranceId: 'u', seq: -1, last: true })
    svc.cancel(); expect(sent.filter(m => m.seq === -1).length).toBe(1) // idempotent
  })
  it('cancel() when idle sends nothing; speak after cancel works again', async () => {
    const { svc, sent } = setup()
    svc.cancel(); expect(sent).toEqual([])
    svc.speak('n', 'A brand new utterance.'); await vi.runAllTimersAsync()
    expect(sent.map(m => m.seq)).toEqual([0])
  })
  it('falls back down the chain on an engine error and names the fallback; sticks to the working engine', async () => {
    const bad = createFakeTts({ id: 'kokoro', fail: new Error('sidecar down') })
    const ok = createFakeTts({ id: 'system' })
    const { svc, sent, fallbacks } = setup([bad, ok])
    svc.speak('u', 'Hello there my friend.'); svc.speak('u', 'And a second sentence.')
    await vi.runAllTimersAsync()
    expect(fallbacks).toEqual(['kokoro>system']) // one toast, not one per sentence
    expect(bad.calls.length).toBe(1)
    expect(ok.calls.map(c => c.text).length).toBe(2)
    expect(ok.calls[0].voiceId).toBe('system-v1') // fallback engines use their own default voice
    expect(sent.length).toBe(2)
  })
  it('when every engine fails the sentence is skipped, onError fires and the queue continues', async () => {
    const errors: unknown[] = []
    const e = createFakeTts({ fail: t => (t.startsWith('Bad') ? new Error('boom') : null) })
    const { svc, sent } = setup([e], { onError: x => errors.push(x) })
    svc.speak('u', 'Bad sentence of text.'); svc.speak('u', 'Good sentence of text.')
    await vi.runAllTimersAsync()
    expect(errors.length).toBe(1)
    expect(sent.map(m => m.seq)).toEqual([0])
  })
  it('an error after audio already started does not replay the sentence on another engine', async () => {
    const half = createFakeTts({ id: 'kokoro', chunks: 3, fail: new Error('mid'), failAfterChunks: 2 })
    const ok = createFakeTts({ id: 'system' })
    const { svc, sent } = setup([half, ok], { onError: () => {} })
    svc.speak('u', 'A sentence long enough.'); await vi.runAllTimersAsync()
    expect(ok.calls.length).toBe(0); expect(sent.length).toBe(2)
  })
})

describe('buildChain', () => {
  const E = (id: 'system' | 'kokoro' | 'openrouter') => createFakeTts({ id })
  const all = { system: E('system'), kokoro: E('kokoro'), openrouter: E('openrouter') }
  const ids = (c: ReturnType<typeof buildChain>) => c.map(e => e.id)
  it('selected → kokoro (installed) → openrouter (key) → system, de-duplicated', () => {
    expect(ids(buildChain('system', all, { kokoroInstalled: true, hasOpenRouterKey: true }))).toEqual(['system', 'kokoro', 'openrouter'])
    expect(ids(buildChain('openrouter', all, { kokoroInstalled: true, hasOpenRouterKey: true }))).toEqual(['openrouter', 'kokoro', 'system'])
    expect(ids(buildChain('kokoro', all, { kokoroInstalled: true, hasOpenRouterKey: false }))).toEqual(['kokoro', 'system'])
  })
  it('skips unavailable engines but always ends on system', () => {
    expect(ids(buildChain('kokoro', all, { kokoroInstalled: false, hasOpenRouterKey: false }))).toEqual(['system'])
    expect(ids(buildChain('openrouter', all, { kokoroInstalled: false, hasOpenRouterKey: false }))).toEqual(['system'])
  })
})
