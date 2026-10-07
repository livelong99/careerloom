// Turns a non-streaming decoder (Whisper) into the streaming SttAdapter contract (plan §3.2, S2 chunker):
// RMS VAD gate → utterance buffer → growing-window partial about every second → final once quiet for endSilenceMs.
// Timestamps come from the audio clock (bytes pushed), never wall time, so tests and the benchmark stay deterministic.
import { createEmitter, type SttAdapter, type SttStartOpts } from './adapter'
import { CONT_EXTRA_MS, earlyEndMs, endsTurn } from './endpoint'
import { createVad } from './vad'

export type Decoder = {
  ready(opts: SttStartOpts): Promise<void>
  decode(pcm: Int16Array, kind: 'partial' | 'final'): Promise<string>
  close(): Promise<void>
}

const PARTIAL_EVERY_MS = 1000
const MIN_SPEECH_MS = 250 // shorter voiced blips (clicks, breaths) are dropped, not decoded
const PARTIAL_MAX_MS = 20_000 // past this a partial decode of the whole turn costs seconds and would hold the final up; the last partial stays on screen
const MAX_SEGMENT_MS = 50_000 // a 20-40 s question must stay one piece (mlx-whisper windows 30 s internally, Parakeet takes long audio); cut only past this

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
  let live = false, endSilenceMs = 700, fast = false
  // Early decode (fastEndpoint): `text` is the final decode of everything buffered so far, valid until speech resumes (epoch moves).
  let epoch = 0, early: { text: string | null } | null = null
  let t = 0, buf: Int16Array[] = [], bufMs = 0, voicedMs = 0, speech = false, quietMs = 0, segStart = 0, lastPartialAt = 0
  let chain: Promise<void> = Promise.resolve(), pending = 0

  const enqueue = (job: () => Promise<void>) => {
    pending++
    chain = chain.then(job).finally(() => { pending-- })
  }
  const fail = (err: unknown, t0: number, t1: number) => emit('error', { text: '', t0, t1, retrying: false, message: (err as Error).message })

  function reset() { buf = []; bufMs = 0; voicedMs = 0; speech = false; quietMs = 0; lastPartialAt = 0; early = null; epoch++ }

  function finish() {
    const pcm = join(buf), t0 = segStart, t1 = t, voiced = voicedMs, e = early
    reset()
    if (voiced < MIN_SPEECH_MS) return
    enqueue(async () => {
      try {
        const text = (e?.text ?? (await decoder.decode(pcm, 'final'))).trim() // the early decode already covers this audio: silence adds no words
        if (!text) return
        emit('final', { text, t0, t1 })
        emit('endOfTurn', { text: '', t0: t1, t1 })
      } catch (err) { fail(err, t0, t1) }
    })
  }

  /** Decode now, while the quiet window is still running; a finished sentence ends the turn without waiting for the rest of it. */
  function startEarly() {
    const pcm = join(buf), t0 = segStart, my = epoch, e: { text: string | null } = { text: null }
    early = e
    enqueue(async () => {
      try {
        e.text = (await decoder.decode(pcm, 'final')).trim()
        if (epoch !== my || !e.text || !endsTurn(e.text)) return // speech resumed, or the turn already ended on the full wait
        const t1 = t
        reset()
        emit('final', { text: e.text, t0, t1 })
        emit('endOfTurn', { text: '', t0: t1, t1 })
      } catch (err) { fail(err, t0, t) }
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
      endSilenceMs = opts.endSilenceMs; fast = !!opts.fastEndpoint
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
        if (early) { early = null; epoch++ } // speech resumed: the early decode no longer covers the utterance
      } else if (speech) {
        buf.push(frame); bufMs += ms; quietMs += ms
        if (quietMs >= endSilenceMs + (fast ? CONT_EXTRA_MS : 0)) return finish() // fast: the early decode (a "?" ends the turn before this) decides; anything else waits out a thinking pause
        if (fast && !early && pending === 0 && voicedMs >= MIN_SPEECH_MS && quietMs >= earlyEndMs(endSilenceMs)) return startEarly()
      }
      if (!speech) return
      if (bufMs >= MAX_SEGMENT_MS) finish()
      else if (pending === 0 && bufMs - lastPartialAt >= PARTIAL_EVERY_MS && bufMs <= PARTIAL_MAX_MS && !(fast && quietMs > 0)) partial() // never queue partials behind a running decode; in the quiet tail the early final decode takes the slot
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
