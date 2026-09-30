// Turns a non-streaming decoder (Whisper) into the streaming SttAdapter contract (plan §3.2, S2 chunker):
// RMS VAD gate → utterance buffer → growing-window partial about every second → final once quiet for endSilenceMs.
// Timestamps come from the audio clock (bytes pushed), never wall time, so tests and the benchmark stay deterministic.
import { createEmitter, type SttAdapter, type SttStartOpts } from './adapter'
import { createVad } from './vad'

export type Decoder = {
  ready(opts: SttStartOpts): Promise<void>
  decode(pcm: Int16Array, kind: 'partial' | 'final'): Promise<string>
  close(): Promise<void>
}

const PARTIAL_EVERY_MS = 1000
const MIN_SPEECH_MS = 250 // shorter voiced blips (clicks, breaths) are dropped, not decoded
const MAX_SEGMENT_MS = 25_000 // Whisper's window is 30 s; cut before it

const join = (parts: Int16Array[]): Int16Array => {
  const out = new Int16Array(parts.reduce((n, p) => n + p.length, 0))
  let o = 0
  for (const p of parts) { out.set(p, o); o += p.length }
  return out
}

export function createChunkedAdapter(o: { id: SttAdapter['id']; decoder: Decoder }): SttAdapter {
  const { on, emit } = createEmitter()
  const { decoder } = o
  let vad = createVad()
  let live = false, endSilenceMs = 700
  let t = 0, buf: Int16Array[] = [], bufMs = 0, voicedMs = 0, speech = false, quietMs = 0, segStart = 0, lastPartialAt = 0
  let chain: Promise<void> = Promise.resolve(), pending = 0

  const enqueue = (job: () => Promise<void>) => {
    pending++
    chain = chain.then(job).finally(() => { pending-- })
  }
  const fail = (err: unknown, t0: number, t1: number) => emit('error', { text: '', t0, t1, retrying: false, message: (err as Error).message })

  function reset() { buf = []; bufMs = 0; voicedMs = 0; speech = false; quietMs = 0; lastPartialAt = 0 }

  function finish() {
    const pcm = join(buf), t0 = segStart, t1 = t, voiced = voicedMs
    reset()
    if (voiced < MIN_SPEECH_MS) return
    enqueue(async () => {
      try {
        const text = (await decoder.decode(pcm, 'final')).trim()
        if (!text) return
        emit('final', { text, t0, t1 })
        emit('endOfTurn', { text: '', t0: t1, t1 })
      } catch (err) { fail(err, t0, t1) }
    })
  }

  function partial() {
    lastPartialAt = bufMs
    const pcm = join(buf), t0 = segStart, t1 = t
    enqueue(async () => {
      try {
        const text = (await decoder.decode(pcm, 'partial')).trim()
        if (text) emit('partial', { text, t0, t1 })
      } catch (err) { fail(err, t0, t1) }
    })
  }

  return {
    id: o.id,
    on,
    async start(opts: SttStartOpts) {
      endSilenceMs = opts.endSilenceMs
      vad = createVad(); t = 0; reset()
      await decoder.ready(opts)
      live = true
    },
    push(pcm16) {
      if (!live) return
      const frame = new Int16Array(pcm16, 0, pcm16.byteLength >> 1), ms = frame.length / 16
      t += ms
      if (vad.isVoiced(frame)) {
        if (!speech) { speech = true; segStart = t - ms }
        buf.push(frame); bufMs += ms; voicedMs += ms; quietMs = 0
      } else if (speech) {
        buf.push(frame); bufMs += ms; quietMs += ms
        if (quietMs >= endSilenceMs) return finish()
      }
      if (!speech) return
      if (bufMs >= MAX_SEGMENT_MS) finish()
      else if (pending === 0 && bufMs - lastPartialAt >= PARTIAL_EVERY_MS) partial() // never queue partials behind a running decode
    },
    async stop() {
      if (!live) return
      live = false
      if (speech) finish()
      await chain
      await decoder.close()
      emit('closed', { text: '', t0: 0, t1: 0 })
    },
  }
}
