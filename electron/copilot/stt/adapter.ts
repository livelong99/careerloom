// Contract stub (WP0): interface only. The owning work package implements it in this file.
import type { SourceId } from '../types'

export type SttEvent = { text: string; t0: number; t1: number; confidence?: number; retrying?: boolean; message?: string }
/** Owner: WP3. One adapter instance per source; 16 kHz mono PCM16 in (plan §6). */
export interface SttAdapter {
  readonly id: 'moonshine' | 'whisper-mlx' | 'faster-whisper' | 'soniox' | 'assemblyai' | 'deepgram' | 'apple' | 'fake'
  start(opts: { source: SourceId; language: string; vocab: string[]; endSilenceMs: number }): Promise<void>
  push(pcm16: ArrayBuffer): void
  on(ev: 'partial' | 'final' | 'endOfTurn' | 'error' | 'closed', cb: (e: SttEvent) => void): void
  stop(): Promise<void>
}
