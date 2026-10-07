// STT adapter contract (plan §6) and a tiny emitter the concrete adapters share.
import type { SourceId } from '../types'

export type SttEvent = { text: string; t0: number; t1: number; confidence?: number; retrying?: boolean; message?: string }
export type SttEventName = 'partial' | 'final' | 'endOfTurn' | 'error' | 'closed'
export type SttStartOpts = { source: SourceId; language: string; vocab: string[]; endSilenceMs: number; /** Interviewer channel: end a finished sentence after ~0.2 s of quiet instead of the full wait (PERF-2). */ fastEndpoint?: boolean }

/** Owner: WP3. One adapter instance per source; 16 kHz mono PCM16 in (plan §6). */
export interface SttAdapter {
  readonly id: 'moonshine' | 'whisper-mlx' | 'faster-whisper' | 'parakeet' | 'soniox' | 'assemblyai' | 'deepgram' | 'apple' | 'fake'
  start(opts: SttStartOpts): Promise<void>
  push(pcm16: ArrayBuffer): void
  on(ev: SttEventName, cb: (e: SttEvent) => void): void
  stop(): Promise<void>
}

export function createEmitter() {
  const subs = new Map<SttEventName, Array<(e: SttEvent) => void>>()
  return {
    on(ev: SttEventName, cb: (e: SttEvent) => void) { subs.set(ev, [...(subs.get(ev) ?? []), cb]) },
    emit(ev: SttEventName, e: SttEvent) { for (const cb of subs.get(ev) ?? []) cb(e) },
  }
}
