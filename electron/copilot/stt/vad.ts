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

const GATE_MARGIN = 1.6 // speech must beat dropped noise by this much to open the gate
const GATE_RELEASE_MS = 2000 // this long below the gate and it forgets the noise

export function createVad() {
  const hist: Array<{ rms: number; ms: number }> = []
  let histMs = 0, gate = 0, belowMs = 0
  return {
    /** Audio that stayed "voiced" but decoded to nothing is steady noise above the loudness cap: only something clearly louder counts as speech until it goes quiet. */
    gateAbove(rms: number): void { gate = rms * GATE_MARGIN; belowMs = 0 },
    isVoiced(frame: Int16Array): boolean {
      const rms = rmsOf(frame), ms = frame.length / 16
      if (gate) {
        if (rms >= gate) belowMs = 0
        else if ((belowMs += ms) >= GATE_RELEASE_MS) gate = 0
        if (gate && rms < gate) return false
      }
      hist.push({ rms, ms }); histMs += ms
      while (hist.length > 1 && histMs - hist[0]!.ms >= HISTORY_MS) histMs -= hist.shift()!.ms
      const floor = percentile(hist.map(h => h.rms), 0.1)
      return rms > Math.max(Math.min(floor * FACTOR, LOUD_RMS), MIN_RMS)
    },
  }
}
