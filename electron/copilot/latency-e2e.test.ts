// End-of-speech -> first visible "say" line, through the real chunked adapter, session controller, detector, auto-ask, engine
// and live wiring, with a fake decoder and a fake provider whose delays are injected profiles on a virtual clock. These are
// SIMULATED numbers (profiles are assumptions, not measurements): they prove the endpointing/auto-ask/speculation logic
// removes the right waits, not how fast any real model is. Real numbers: scripts/copilot-latency.mjs --live.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { createFakeAdapter } from './stt/fake'
import { createDetector } from './detector'
import { DEFAULT_CONFIG } from './config'
import { createAnswerEngine, type AnswerProvider, type StreamItem } from './engine'
import { buildGrounding } from './context'
import { createLiveWiring } from './live-wiring'
import { createSessionController } from './session'
import type { SttAdapter } from './stt/adapter'
import { createChunkedAdapter } from './stt/buffer'
import { concat, frames, silence, tone } from './stt/pcm-gen.test-util'
import type { CopilotEvents, Suggestion } from './types'

beforeEach(() => vi.useFakeTimers({ now: 0 }))
afterEach(() => vi.useRealTimers())

const QUESTION = 'Why do you want to work here?'
type Profile = { decodeMs: number; ttftMs: number; fast: boolean; speculative?: boolean; endSilenceMs?: number; text?: string; adapter?: () => SttAdapter }
/** The session always asks for the fast endpoint on this channel; the baseline run drops it to get the pre-PERF-2 behaviour. */
const withFast = (fast: boolean, a: SttAdapter): SttAdapter => (fast ? a : { ...a, id: a.id, on: a.on, push: a.push, stop: a.stop, start: o => a.start({ ...o, fastEndpoint: false }) })
const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms))

async function measure(p: Profile, speechMs: number): Promise<{ endToSay: number | null; asks: number; spec: ReturnType<ReturnType<typeof createLiveWiring>['metrics']>['speculation'] }> {
  const cfg = structuredClone(DEFAULT_CONFIG)
  cfg.engine.autoAnswer = true; cfg.engine.speculativeStart = !!p.speculative
  const text = p.text ?? QUESTION
  const provider: AnswerProvider = {
    id: 'openrouter',
    stream: async function* () { await sleep(p.ttftMs); yield { delta: '[SAY]\nI like the mission.\n' } as StreamItem; yield { delta: '[BULLETS]\n- cue\n' } as StreamItem },
  }
  const engine = createAnswerEngine({ provider, config: () => cfg, grounding: () => buildGrounding({ jobId: 'j', title: 'Eng', company: 'Acme', report: null, rawReport: null, posting: null }, '# CV'), partialEveryMs: 0 })
  let firstSayAt: number | null = null
  let asks = 0
  const out: Suggestion[] = []
  // eslint-disable-next-line prefer-const
  let session: ReturnType<typeof createSessionController>
  const wiring = createLiveWiring({
    host: { publishState: () => undefined, publish: (ev, payload) => { if (ev === 'copilotSuggestion') { const s = payload as Suggestion; out.push(s); if (firstSayAt === null && s.say.trim()) firstSayAt = Date.now() } }, setSessionHooks: () => undefined, onAction: () => undefined },
    recorder: { line: () => undefined, question: () => { asks++ }, suggestion: () => undefined },
    feed: async () => undefined, engine, detector: createDetector({ now: Date.now }), config: () => cfg, onStopped: () => undefined,
  })
  session = createSessionController({
    createAdapter: () => p.adapter?.() ?? withFast(p.fast, createChunkedAdapter({ id: 'fake', decoder: { ready: async () => undefined, decode: async (_pcm, kind) => { await sleep(p.decodeMs); return kind === 'final' ? text : text }, close: async () => undefined } })),
    stt: () => ({ ...cfg.stt, endSilenceMs: p.endSilenceMs ?? 650 }), sources: () => ['system'], emit: wiring.emit, endOfTurn: s => wiring.endOfTurn(s), now: Date.now, newId: () => 'S',
  })
  wiring.bindSession(session)
  await session.start({ mode: 'live', jobId: 'j', interviewType: 'mixed', consent: null })
  const pcm = concat(silence(300), tone(speechMs), silence(3000))
  let speechEnd = 0
  let t = 0
  for (const f of frames(pcm)) {
    t += 100
    if (t === 300 + speechMs + (speechMs % 100 ? 100 - (speechMs % 100) : 0)) speechEnd = Date.now() + 100 // end of the last voiced frame
    session.audio({ source: 'system', pcm16: f.slice().buffer, t })
    await vi.advanceTimersByTimeAsync(100)
  }
  await vi.advanceTimersByTimeAsync(3000)
  await session.stop('user')
  return { endToSay: firstSayAt === null ? null : firstSayAt - speechEnd, asks, spec: wiring.metrics().speculation }
}

describe('end-of-speech -> first visible line (simulated profiles; see header)', () => {
  const PROFILE = { decodeMs: 400, ttftMs: 700 } // assumed: Whisper-class final decode, fast-tier first token

  it('adaptive endpointing removes most of the silence wait', async () => {
    const base = await measure({ ...PROFILE, fast: false }, 1900)
    const fast = await measure({ ...PROFILE, fast: true }, 1900)
    console.info('PERF-2 simulated end-of-speech -> first say (decode 400 ms, TTFT 700 ms, endSilence 650 ms): baseline', base.endToSay, 'ms, fast endpoint', fast.endToSay, 'ms')
    expect(base.endToSay).not.toBeNull(); expect(fast.endToSay).not.toBeNull()
    expect(fast.endToSay!).toBeLessThan(base.endToSay! - 250)
    expect(fast.endToSay!).toBeLessThanOrEqual(1500) // plan §10 auto-ask budget under these profiles
    expect(fast.asks).toBe(1)
  })

  // Streaming engines (Moonshine-like) emit a full-sentence partial at the end of speech and the final one endpoint later.
  const streaming = (partial: string, final: string, speechEnd: number, finalAfter: number) => () => createFakeAdapter([
    { atMs: speechEnd + 100, ev: 'partial', text: partial, t0: 300, t1: speechEnd + 100 },
    { atMs: speechEnd + finalAfter, ev: 'final', text: final, t0: 300, t1: speechEnd + finalAfter },
    { atMs: speechEnd + finalAfter, ev: 'endOfTurn', text: '', t0: speechEnd + finalAfter, t1: speechEnd + finalAfter },
  ])
  const SPEECH_END = 300 + 1900

  it('speculative start: a hit overlaps the first token with the final wait; a miss costs no extra wait', async () => {
    const off = await measure({ ...PROFILE, fast: true, adapter: streaming(QUESTION, QUESTION, SPEECH_END, 700) }, 1900)
    const hit = await measure({ ...PROFILE, fast: true, speculative: true, adapter: streaming(QUESTION, QUESTION, SPEECH_END, 700) }, 1900)
    const miss = await measure({ ...PROFILE, fast: true, speculative: true, adapter: streaming('Why do you want to work.', 'Why do you want to work here and what do you know about us?', SPEECH_END, 700) }, 1900)
    console.info('PERF-2 simulated streaming engine, final 700 ms after speech, TTFT 700 ms: speculation off', off.endToSay, 'ms | on (hit)', hit.endToSay, 'ms | on (miss)', miss.endToSay, 'ms; hit stats', JSON.stringify(hit.spec), 'miss stats', JSON.stringify(miss.spec))
    expect(hit.spec).toMatchObject({ started: 1, hits: 1, misses: 0 })
    expect(hit.endToSay!).toBeLessThan(off.endToSay! - 400)
    expect(miss.spec).toMatchObject({ started: 1, hits: 0, misses: 1 })
    expect(miss.spec.wastedTokens).toBeGreaterThanOrEqual(0)
    expect(miss.endToSay!).toBeLessThanOrEqual(off.endToSay! + 100)
  })
})
