// Wires main's `careerloom:ttsAudio` PCM stream to the queue and reports playback back to main (echo gate). Nothing plays until arm().
import type { KbEvents, TtsAudioMsg } from '../../../electron/kb/types'
import { createPlaybackQueue, type AudioCtxLike, type PlaybackQueue } from './queue'

export type TtsPlayerBridge = {
  /** Subscribe to PCM from main (`careerloom:ttsAudio`); returns the unsubscribe. */
  onTtsAudio(cb: (m: TtsAudioMsg) => void): () => void
  kbTtsPlayback(e: KbEvents['ttsPlayback']): void
}

/** `arm()` must be called from an explicit user Start; until then audio is dropped and no AudioContext exists. */
export function attachTtsPlayer(bridge: TtsPlayerBridge, makeCtx: () => AudioCtxLike = () => new AudioContext({ sampleRate: 24000 }) as unknown as AudioCtxLike): PlaybackQueue & { detach(): void } {
  const q = createPlaybackQueue({ ctx: makeCtx, onPlayback: bridge.kbTtsPlayback })
  const off = bridge.onTtsAudio(q.push)
  return { ...q, detach() { off(); q.disarm() } }
}
