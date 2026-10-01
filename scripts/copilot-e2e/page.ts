// QA harness page: the real mic capture pipeline, frames sent to main exactly like the overlay will.
import { startMic } from '../../renderer/overlay/capture/mic'

declare global { interface Window { h: { audio(m: { source: 'mic'; pcm16: ArrayBuffer; t: number }): void; log(s: string): void } } }
const t0 = Date.now()
let n = 0, peak = 0
setInterval(() => { window.h.log(`frames=${n} peak=${peak}`); peak = 0 }, 1000)
startMic({ onFrame: pcm16 => { n++; for (const v of new Int16Array(pcm16)) peak = Math.max(peak, Math.abs(v)); window.h.audio({ source: 'mic', pcm16, t: Date.now() - t0 }) }, onEnded: () => window.h.log('track ended') })
  .then(() => window.h.log('mic started'))
  .catch(e => window.h.log(`mic failed: ${e?.name}: ${e?.message}`))
