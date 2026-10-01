// Deterministic fake engine for tests: a 24 kHz sine per sentence, programmable latency/failure, records every call.
import type { VoiceInfo } from '../kb/types'
import type { Pcm, TtsEngine } from './adapter'
import type { TtsEngineId } from '../interviewer/types'

export type FakeOpts = { id?: TtsEngineId; latencyMs?: number; chunks?: number; msPerChar?: number; fail?: Error | ((text: string) => Error | null); failAfterChunks?: number; voices?: VoiceInfo[] }
export type FakeEngine = TtsEngine & { calls: Array<{ text: string; voiceId: string; speed: number }>; aborted: string[] }

export const sine = (ms: number, hz = 440): Pcm => {
  const n = Math.round(24 * ms)
  const a = new Int16Array(n)
  for (let i = 0; i < n; i++) a[i] = Math.round(Math.sin((2 * Math.PI * hz * i) / 24000) * 12000)
  return { pcm16: a.buffer as ArrayBuffer, sampleRate: 24000 }
}

export function createFakeTts(o: FakeOpts = {}): FakeEngine {
  const id = o.id ?? 'system'
  const calls: FakeEngine['calls'] = []
  const aborted: string[] = []
  const wait = (ms: number, signal: AbortSignal) => new Promise<void>(res => {
    if (signal.aborted) return res()
    const t = setTimeout(res, ms)
    signal.addEventListener('abort', () => { clearTimeout(t); res() }, { once: true })
  })
  return {
    id, calls, aborted,
    voices: async () => o.voices ?? [{ engine: id, id: `${id}-v1`, name: 'Fake', lang: 'en_IN', offline: true, installed: true, sizeMb: null, note: null }],
    async *synth(text, voiceId, speed, signal) {
      calls.push({ text, voiceId, speed })
      const err = typeof o.fail === 'function' ? o.fail(text) : o.fail
      if (err && o.failAfterChunks === undefined) throw err
      await wait(o.latencyMs ?? 0, signal)
      const chunks = o.chunks ?? 1
      for (let i = 0; i < chunks; i++) {
        if (signal.aborted) { aborted.push(text); return }
        if (err && i >= (o.failAfterChunks ?? 0)) throw err
        yield sine(((o.msPerChar ?? 40) * text.length) / chunks)
      }
    },
  }
}
