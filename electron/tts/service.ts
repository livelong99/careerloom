// TTS service: sequential per-sentence rendering (sentence N+1 renders while N plays), cancel, fallback chain (plan §6.6).
import type { TtsEngineId } from '../interviewer/types'
import type { TtsAudioMsg } from '../kb/types'
import type { TtsEngine } from './adapter'

/** `speak` queues one sentence of an utterance; `end` closes the utterance once its audio is rendered; `cancel` stops everything now. */
export interface TtsService {
  speak(utteranceId: string, sentence: string): void
  end(utteranceId: string): void
  cancel(): void
}
export type TtsServiceOpts = {
  /** Engines to try, selected first (see buildChain). Read per sentence so settings changes apply immediately. */
  chain: () => TtsEngine[]
  /** `engine` names who `voiceId` belongs to; another engine (after a fallback or an uninstall) picks its own default voice. */
  voice: () => { voiceId: string | null; speed: number; engine?: string }
  send: (m: TtsAudioMsg) => void
  onFallback?: (from: TtsEngineId, to: TtsEngineId, err: unknown) => void
  onError?: (err: unknown) => void
}

const EMPTY = new ArrayBuffer(0)
/** seq -1 + last: the renderer must stop and flush immediately (cancel marker; plan §4 contract has no separate channel). */
export const CANCEL_SEQ = -1

export function buildChain(selected: TtsEngineId, all: Record<TtsEngineId, TtsEngine>, avail: { kokoroInstalled: boolean; hasOpenRouterKey: boolean }): TtsEngine[] {
  const order: TtsEngineId[] = [selected, ...(avail.kokoroInstalled ? ['kokoro' as const] : []), ...(avail.hasOpenRouterKey ? ['openrouter' as const] : []), 'system']
  const ok = (id: TtsEngineId) => id === 'system' || (id === 'kokoro' ? avail.kokoroInstalled : avail.hasOpenRouterKey)
  return [...new Set(order)].filter(ok).map(id => all[id])
}

type Job = { kind: 'say'; id: string; text: string } | { kind: 'end'; id: string }

export function createTtsService(o: TtsServiceOpts): TtsService {
  let queue: Job[] = []
  let ctl: AbortController | null = null
  let running = false
  let epoch = 0
  let lastId: string | null = null
  const seq = new Map<string, number>()
  let sticky: TtsEngineId | null = null // first engine that worked after a fallback; reset on cancel

  const next = (id: string) => { const n = seq.get(id) ?? 0; seq.set(id, n + 1); return n }

  async function render(id: string, text: string, my: number, signal: AbortSignal): Promise<void> {
    const chain = o.chain()
    const start = sticky ? Math.max(0, chain.findIndex(e => e.id === sticky)) : 0
    let lastErr: unknown
    for (let i = start; i < chain.length; i++) {
      const eng = chain[i]
      let emitted = false
      try {
        const sel = o.voice()
        const voiceId = sel.voiceId && (sel.engine === undefined ? i === 0 : sel.engine === eng.id) ? sel.voiceId : null
        const v = voiceId ?? (await eng.voices()).find(x => x.installed)?.id
        if (!v) throw new Error(`${eng.id}: no voice available`)
        for await (const c of eng.synth(text, v, sel.speed, signal)) {
          if (signal.aborted || my !== epoch) return
          emitted = true
          o.send({ utteranceId: id, seq: next(id), pcm16: c.pcm16, sampleRate: 24000, last: false })
        }
        if (i !== start) { o.onFallback?.(chain[start].id, eng.id, lastErr); sticky = eng.id }
        return
      } catch (e) {
        if (signal.aborted || my !== epoch) return
        lastErr = e
        if (emitted) { o.onError?.(e); return } // partial audio already queued: never replay the sentence elsewhere
      }
    }
    o.onError?.(lastErr)
  }

  async function pump(): Promise<void> {
    if (running) return
    running = true
    try {
      while (queue.length) {
        const job = queue.shift() as Job
        const my = epoch
        if (job.kind === 'end') { o.send({ utteranceId: job.id, seq: next(job.id), pcm16: EMPTY, sampleRate: 24000, last: true }); seq.delete(job.id); continue }
        ctl = new AbortController()
        await render(job.id, job.text, my, ctl.signal)
      }
    } finally { running = false; ctl = null }
  }

  return {
    speak(id, text) { lastId = id; queue.push({ kind: 'say', id, text }); void pump() },
    end(id) { queue.push({ kind: 'end', id }); void pump() },
    cancel() {
      if (!lastId) return // nothing spoken since the last cancel (the renderer may still be playing buffered audio even when rendering is done)
      epoch++
      queue = []; sticky = null
      ctl?.abort()
      o.send({ utteranceId: lastId, seq: CANCEL_SEQ, pcm16: EMPTY, sampleRate: 24000, last: true }); seq.delete(lastId); lastId = null
    },
  }
}
