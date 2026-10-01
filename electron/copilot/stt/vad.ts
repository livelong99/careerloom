// RMS voice-activity gate with an adaptive noise floor (S2 harness chunker, plan §3.2): a frame is voiced when its RMS
// beats 2.5x the 10th-percentile RMS of the trailing 4 s (capped, see LOUD_RMS), and an absolute minimum. Audio-clock only, no timers.
import { percentile } from './bench'

const HISTORY_MS = 4000
const FACTOR = 2.5
const MIN_RMS = 0.004 // float scale: digital silence and converter hiss stay below it
const LOUD_RMS = 0.05 // about -26 dBFS: always speech, so audio that starts mid-word cannot raise its own floor above itself

export const rmsOf = (pcm: Int16Array): number => {
  let s = 0
  for (const v of pcm) s += (v / 32768) ** 2
  return pcm.length ? Math.sqrt(s / pcm.length) : 0
}

export function createVad() {
  const hist: Array<{ rms: number; ms: number }> = []
  let histMs = 0
  return {
    isVoiced(frame: Int16Array): boolean {
      const rms = rmsOf(frame), ms = frame.length / 16
      hist.push({ rms, ms }); histMs += ms
      while (hist.length > 1 && histMs - hist[0]!.ms >= HISTORY_MS) histMs -= hist.shift()!.ms
      const floor = percentile(hist.map(h => h.rms), 0.1)
      return rms > Math.max(Math.min(floor * FACTOR, LOUD_RMS), MIN_RMS)
    },
  }
}
