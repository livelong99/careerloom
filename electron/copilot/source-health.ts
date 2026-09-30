// Silent-source detector (plan §3.1). A dead or permission-less track raises no error: it just delivers
// nothing, or digital zeros. Status flips to 'silent' once no non-zero audio has arrived for `silentMs`;
// checked every `tickMs`, so it fires between silentMs and silentMs + tickMs after the last signal.
import type { SourceHealth, SourceId } from './types'

export const SILENT_MS = 2500
export const TICK_MS = 250

/** Peak absolute sample (0..32768) of PCM16. */
export function peakOf(pcm16: ArrayBuffer): number {
  const s = new Int16Array(pcm16, 0, pcm16.byteLength >> 1)
  let p = 0
  for (let i = 0; i < s.length; i++) { const a = Math.abs(s[i]!); if (a > p) p = a }
  return p
}

export function createSourceHealth(source: SourceId, onChange: (h: SourceHealth) => void, now: () => number = Date.now, silentMs = SILENT_MS) {
  let lastSignal = now(), level = 0, status: SourceHealth['status'] = 'ok', timer: ReturnType<typeof setInterval> | null = null
  const set = (next: SourceHealth['status']) => { if (next !== status) { status = next; onChange({ source, status, level }) } }
  return {
    /** Feed every PCM16 chunk (even all-zero ones: those count as "received", not as signal). */
    feed(pcm16: ArrayBuffer) {
      const peak = peakOf(pcm16)
      level = Math.min(1, peak / 32768)
      if (peak > 0) { lastSignal = now(); set('ok') }
    },
    check() { if (now() - lastSignal >= silentMs) set('silent') },
    start() { lastSignal = now(); status = 'ok'; timer = setInterval(() => this.check(), TICK_MS) },
    stop() { if (timer) clearInterval(timer); timer = null },
    get level() { return level },
    get status() { return status },
  }
}
