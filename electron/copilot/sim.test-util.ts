// Deterministic interview simulator: a scripted fake OpenRouter (real SSE bytes through the real provider), the real detector, auto-ask,
// engine, guard and live wiring, and a driver that feeds interviewer transcript lines on vitest's fake clock. Test-only.
import { vi } from 'vitest'

import { buildGrounding } from './context'
import { DEFAULT_CONFIG } from './config'
import { createDetector, type Classify } from './detector'
import { createAnswerEngine } from './engine'
import { createLiveWiring } from './live-wiring'
import { createOpenRouter } from './providers/openrouter'
import { createTraceLog } from './trace'
import type { CopilotConfig, CopilotEvents, DetectedQuestion, Suggestion, TranscriptLine } from './types'

export type Reply = { text?: string; ttftMs?: number; gapMs?: number; status?: number; message?: string; afterMs?: number; raw?: string[]; reasoning?: string; hang?: boolean }
export type Req = { n: number; model: string; user: string; at: number; aborted: boolean; firstChunkAt: number | null }

const wait = (ms: number) => new Promise<void>(r => setTimeout(r, ms))
const enc = new TextEncoder()
const sse = (o: unknown): Uint8Array => enc.encode(`data: ${typeof o === 'string' ? o : JSON.stringify(o)}\n\n`)
/** ~14-char deltas so streaming is observable. */
const pieces = (t: string): string[] => t.match(/[\s\S]{1,14}/g) ?? []

export const reply = (say: string, bullets: string[] = [], extra = ''): string => `[SAY]\n${say}\n[BULLETS]\n${bullets.map(b => `- ${b}`).join('\n')}${extra}`

export function fakeOpenRouter(pick: (n: number, model: string, user: string) => Reply) {
  const requests: Req[] = []
  const fetchFn = (async (url: string, init?: RequestInit): Promise<Response> => {
    if (String(url).endsWith('/key')) return new Response('{}')
    const body = JSON.parse(String(init?.body)) as { model: string; messages: Array<{ role: string; content: unknown }> }
    const last = body.messages[body.messages.length - 1]!.content
    const req: Req = { n: requests.length + 1, model: body.model, user: typeof last === 'string' ? last : '', at: Date.now(), aborted: false, firstChunkAt: null }
    requests.push(req)
    const r = pick(req.n, req.model, req.user)
    const signal = init?.signal as AbortSignal | undefined
    if (r.status) { await wait(r.afterMs ?? 0); return new Response(JSON.stringify({ error: { message: r.message ?? 'error' } }), { status: r.status }) }
    return new Response(new ReadableStream<Uint8Array>({
      async start(c) {
        let completed = false
        signal?.addEventListener('abort', () => { if (completed) return; req.aborted = true; try { c.error(new Error('aborted')) } catch { /* closed */ } }, { once: true })
        try {
          await wait(r.ttftMs ?? 300)
          if (r.hang) return
          const push = (b: Uint8Array): void => { req.firstChunkAt ??= Date.now(); c.enqueue(b) }
          if (r.reasoning) push(sse({ choices: [{ delta: { reasoning: r.reasoning } }] }))
          for (const raw of r.raw ?? []) push(sse(raw))
          for (const p of r.text === undefined ? [] : pieces(r.text)) { push(sse({ choices: [{ delta: { content: p } }] })); await wait(r.gapMs ?? 20) }
          push(sse({ choices: [], usage: { prompt_tokens: 900, completion_tokens: 60, cost: 0.0004 } })); push(sse('[DONE]'))
          completed = true; c.close()
        } catch { /* aborted */ }
      },
    }), { status: 200 })
  }) as unknown as typeof fetch
  return { fetch: fetchFn, requests }
}

export type Sim = ReturnType<typeof createSim>
export type SimOpts = { pick: (n: number, model: string, user: string) => Reply; config?: (c: CopilotConfig) => void; classify?: Classify; engine?: { hedgeAfterMs?: number }; partialEveryMs?: number; sources?: Array<'mic' | 'system'> }

export function createSim(o: SimOpts) {
  const cfg = structuredClone(DEFAULT_CONFIG)
  cfg.engine.autoAnswer = true
  o.config?.(cfg)
  const or = fakeOpenRouter(o.pick)
  const trace = createTraceLog()
  const provider = createOpenRouter({ getKey: () => 'test-key', config: () => cfg.engine.openrouter, fetch: or.fetch, baseUrl: 'http://fake' })
  const engine = createAnswerEngine({ provider, config: () => cfg, trace, partialEveryMs: o.partialEveryMs ?? 0, ...(o.engine ?? {}),
    grounding: () => buildGrounding({ jobId: 'j', title: 'Data Engineer', company: 'Acme', report: null, rawReport: null, posting: null }, '# CV\nBuilt Kafka pipelines at Globex for 3 years.') })
  const events: Array<{ at: number; ev: keyof CopilotEvents; payload: unknown }> = []
  const actions: Array<(a: string) => void> = []
  const recorded = { questions: [] as DetectedQuestion[], suggestions: [] as Suggestion[] }
  let hooks: { stopCapture(): unknown; abortRequests(): void } | null = null
  const wiring = createLiveWiring({
    host: { publishState: () => undefined, publish: (ev, payload) => void events.push({ at: Date.now(), ev, payload }), setSessionHooks: h => { hooks = h }, onAction: cb => void actions.push(cb as (a: string) => void) },
    recorder: { line: () => undefined, question: q => void recorded.questions.push(q), suggestion: s => void recorded.suggestions.push(s) },
    feed: async () => undefined, engine, detector: createDetector({ now: Date.now, classify: o.classify }), config: () => cfg, onStopped: () => undefined, warmEveryMs: 3_600_000,
  })
  const sources = o.sources ?? ['system']
  wiring.bindSession({ stop: vi.fn(async () => undefined) })
  wiring.emit('copilotState', { state: 'armed', mode: 'live', sessionId: 'S', sources, startedAt: 0 })
  wiring.emit('copilotState', { state: 'listening', mode: 'live', sessionId: 'S', sources, startedAt: 0 })
  let id = 0
  const ofType = <K extends keyof CopilotEvents>(k: K) => events.filter(e => e.ev === k).map(e => ({ at: e.at, p: e.payload as CopilotEvents[K] }))
  return {
    cfg, trace, wiring, requests: or.requests, events, recorded, ofType,
    press: (a: string) => { for (const cb of actions) cb(a) },
    panic: () => hooks!.abortRequests(),
    /** An interviewer final (STT segment). */
    final: (text: string, speaker: TranscriptLine['speaker'] = 'interviewer') => wiring.emit('copilotTranscript', { id: `L${++id}`, speaker, text, final: true, t0: Date.now() - 1500, t1: Date.now() }),
    /** Let virtual time pass (timers, SSE, retries). */
    advance: (ms: number) => vi.advanceTimersByTimeAsync(ms),
    /** Finals of the current answer: the last suggestion per question, only the done ones. */
    done: () => ofType('copilotSuggestion').filter(s => s.p.done).map(s => s.p),
    errors: () => ofType('copilotError').map(e => e.p),
  }
}

export const words = (s: string): number => s.trim().split(/\s+/).filter(Boolean).length
