// Validation for the high-rate `careerloom:copilotAudio` channel (ipcRenderer.send, so no reply path for errors): bad input is dropped.
import type { AudioChunkMsg } from './types'

const MAX_BYTES = 1 << 20 // 1 MiB ≈ 32 s of 16 kHz PCM16; the worklet sends 100 ms frames

export function parseAudioMsg(raw: unknown): AudioChunkMsg | null {
  if (typeof raw !== 'object' || raw === null) return null
  const m = raw as { source?: unknown; pcm16?: unknown; t?: unknown }
  if ((m.source !== 'mic' && m.source !== 'system') || typeof m.t !== 'number' || !Number.isFinite(m.t)) return null
  let pcm16: ArrayBuffer
  if (m.pcm16 instanceof ArrayBuffer) pcm16 = m.pcm16
  else if (ArrayBuffer.isView(m.pcm16)) pcm16 = m.pcm16.buffer.slice(m.pcm16.byteOffset, m.pcm16.byteOffset + m.pcm16.byteLength) as ArrayBuffer
  else return null
  if (pcm16.byteLength === 0 || pcm16.byteLength % 2 !== 0 || pcm16.byteLength > MAX_BYTES) return null
  return { source: m.source, pcm16, t: m.t }
}

/** Gate hook (KB-WP5): the mic is muted while the interviewer speaks (speakers mode); system audio passes. */
export const mutedByGate = (m: AudioChunkMsg, gate: { drops(): boolean }): boolean => m.source === 'mic' && gate.drops()
