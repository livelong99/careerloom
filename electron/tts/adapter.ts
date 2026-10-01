// WP5 owns this file. Engine contract: 24 kHz mono PCM16 chunks, cancellable.
import type { TtsEngineId } from '../interviewer/types'
import type { VoiceInfo } from '../kb/types'

export type Pcm = { pcm16: ArrayBuffer; sampleRate: 24000 }
export interface TtsEngine {
  id: TtsEngineId
  voices(): Promise<VoiceInfo[]>
  synth(text: string, voiceId: string, speed: number, signal: AbortSignal): AsyncIterable<Pcm>
}
