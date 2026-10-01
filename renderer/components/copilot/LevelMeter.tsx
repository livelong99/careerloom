import { useEffect, useState } from 'react'

import { cn } from '@/lib/utils'

const BARS = 14

/** Bars for a 0..1 level. The numeric level is exposed to assistive tech; the bars are decoration. */
export function LevelMeter({ level, label = 'Input level' }: { level: number; label?: string }) {
  const on = Math.round(Math.min(1, Math.max(0, level)) * BARS)
  return (
    <div role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(level * 100)} className="flex items-end gap-0.5">
      {Array.from({ length: BARS }, (_, i) => <span key={i} aria-hidden className={cn('h-3 w-1 rounded-sm', i < on ? 'bg-primary' : 'bg-muted')} />)}
    </div>
  )
}

/** Best-effort live level from the chosen mic, only while `active` (the 3 s test). Needs no permission beyond the mic itself; any failure leaves the level at 0. */
export function useMicLevel(active: boolean, deviceId: string | null): number {
  const [level, setLevel] = useState(0)
  useEffect(() => {
    if (!active || !navigator.mediaDevices?.getUserMedia || typeof AudioContext === 'undefined') { setLevel(0); return }
    let stop = false
    let cleanup = (): void => {}
    navigator.mediaDevices.getUserMedia({ audio: deviceId ? { deviceId: { exact: deviceId } } : true }).then(stream => {
      if (stop) { stream.getTracks().forEach(t => t.stop()); return }
      const ctx = new AudioContext()
      const node = ctx.createAnalyser()
      node.fftSize = 512
      ctx.createMediaStreamSource(stream).connect(node)
      const buf = new Uint8Array(node.fftSize)
      let raf = 0
      const tick = (): void => {
        node.getByteTimeDomainData(buf)
        let peak = 0
        for (const v of buf) peak = Math.max(peak, Math.abs(v - 128))
        setLevel(Math.min(1, peak / 64))
        raf = requestAnimationFrame(tick)
      }
      tick()
      cleanup = () => { cancelAnimationFrame(raf); stream.getTracks().forEach(t => t.stop()); void ctx.close() }
    }, () => setLevel(0))
    return () => { stop = true; cleanup(); setLevel(0) }
  }, [active, deviceId])
  return level
}
