// PCM → AudioContext: gapless scheduling, 30 ms fade cancel, started/ended/cancelled events (plan §6.6). No <audio>, so no CSP change.
import type { KbEvents, TtsAudioMsg } from '../../../electron/kb/types'

/** The slice of AudioContext used here (lets tests run with a manual clock). */
export type AudioCtxLike = Pick<AudioContext, 'currentTime' | 'destination' | 'createGain'> & {
  createBuffer(channels: number, length: number, rate: number): { duration: number; getChannelData(c: number): Float32Array }
  createBufferSource(): { buffer: unknown; onended: null | (() => void); connect(n: unknown): void; start(t: number): void; stop(t: number): void }
}
type Src = ReturnType<AudioCtxLike['createBufferSource']>
type Playback = KbEvents['ttsPlayback']

export type PlaybackQueue = { arm(): void; disarm(): void; push(m: TtsAudioMsg): void; cancel(): void }
const CANCEL_SEQ = -1

export function createPlaybackQueue(o: { ctx: () => AudioCtxLike; onPlayback: (e: Playback) => void; fadeMs?: number }): PlaybackQueue {
  const fade = (o.fadeMs ?? 30) / 1000
  let armed = false
  let ctx: AudioCtxLike | null = null
  let nextAt = 0
  let cur: { id: string; pending: number; closed: boolean; started: boolean } | null = null
  let sources: Array<{ src: Src; gain: ReturnType<AudioCtxLike['createGain']> }> = []

  const finishIfDone = (u: NonNullable<typeof cur>) => { if (cur === u && u.closed && u.pending === 0) { cur = null; o.onPlayback({ phase: 'ended', utteranceId: u.id }) } }

  const cancel = () => {
    if (!cur) return
    const t = ctx?.currentTime ?? 0
    for (const { src, gain } of sources) {
      try { gain.gain.cancelScheduledValues(t); gain.gain.setValueAtTime(1, t); gain.gain.linearRampToValueAtTime(0, t + fade); src.stop(t + fade) } catch { /* already stopped */ }
    }
    const id = cur.id
    cur = null; sources = []; nextAt = 0
    o.onPlayback({ phase: 'cancelled', utteranceId: id })
  }

  return {
    arm() { armed = true },
    disarm() { cancel(); armed = false },
    cancel,
    push(m) {
      if (!armed) return
      if (m.seq === CANCEL_SEQ) { cancel(); return }
      if (m.pcm16.byteLength % 2 !== 0) return
      if (cur && cur.id !== m.utteranceId) cancel() // a new utterance replaces a still-playing one
      if (m.pcm16.byteLength > 0) {
        const c = (ctx ??= o.ctx())
        const i16 = new Int16Array(m.pcm16)
        const buf = c.createBuffer(1, i16.length, m.sampleRate)
        const ch = buf.getChannelData(0)
        for (let i = 0; i < i16.length; i++) ch[i] = i16[i] / 32768
        const src = c.createBufferSource(); const gain = c.createGain()
        src.buffer = buf; src.connect(gain); gain.connect(c.destination)
        nextAt = Math.max(nextAt, c.currentTime)
        const u = (cur ??= { id: m.utteranceId, pending: 0, closed: false, started: false })
        if (!u.started) { u.started = true; o.onPlayback({ phase: 'started', utteranceId: u.id }) }
        u.pending++
        src.onended = () => { sources = sources.filter(s => s.src !== src); if (cur === u) { u.pending--; finishIfDone(u) } }
        src.start(nextAt); nextAt += buf.duration
        sources.push({ src, gain })
      }
      if (m.last && cur) { cur.closed = true; finishIfDone(cur) }
    },
  }
}
