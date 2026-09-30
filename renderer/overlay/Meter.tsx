/** Level bars: `level` (0..1) lights that share of the bars; the last two lit bars read "hot" (mic only). */
export function Meter({ level, bars = 10, sys = false }: { level: number; bars?: number; sys?: boolean }) {
  const on = Math.round(Math.min(1, Math.max(0, level)) * bars)
  return (
    <span className={`meter${sys ? ' sys' : ''}`} aria-hidden="true">
      {Array.from({ length: bars }, (_, i) => <i key={i} className={i < on ? (i > bars - 3 && !sys ? 'on hot' : 'on') : ''} />)}
    </span>
  )
}
