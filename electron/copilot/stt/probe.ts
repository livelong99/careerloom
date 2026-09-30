// "Test for 3 seconds" backend (plan §4 copilotProbeAudio): the renderer streams frames over `copilotAudio` while main
// listens for the window. ok = any non-zero audio, silent = frames but only digital zeros, missing = no frames at all.
import { peakOf } from '../source-health'
import type { AudioChunkMsg, SourceHealth, SourceId } from '../types'

export function createProbeHub() {
  const taps = new Set<(m: AudioChunkMsg) => void>()
  return {
    tap: (m: AudioChunkMsg) => { for (const t of taps) t(m) },
    active: () => taps.size,
    probe(source: SourceId, ms: number): Promise<SourceHealth> {
      return new Promise(resolve => {
        let frames = 0, peak = 0
        const tap = (m: AudioChunkMsg) => { if (m.source === source) { frames++; peak = Math.max(peak, peakOf(m.pcm16)) } }
        taps.add(tap)
        setTimeout(() => {
          taps.delete(tap)
          resolve({ source, status: frames === 0 ? 'missing' : peak > 0 ? 'ok' : 'silent', level: Math.min(1, peak / 32768) })
        }, ms)
      })
    },
  }
}
