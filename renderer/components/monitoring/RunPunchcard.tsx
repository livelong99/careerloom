import { useMemo, useRef, useState } from 'react'

const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']
const HOURS = Array.from({ length: 24 }, (_, h) => h)

// Mon-first weekday index; getDay() is 0=Sun..6=Sat.
const weekdayIndex = (d: Date) => (d.getDay() + 6) % 7

// Perceptual ramp: sqrt keeps single runs visible against a busy cell.
function intensity(count: number, max: number): number {
  return max > 0 && count > 0 ? Math.sqrt(count / max) : 0
}

/** Weekday × hour run-start punchcard (codeburn components/Punchcard.tsx,
 *  adapted from per-bucket $ spend to run counts — same inline-style approach,
 *  no chart-specific CSS classes needed). */
export function RunPunchcard({ starts }: { starts: number[] }) {
  const wrapRef = useRef<HTMLDivElement | null>(null)
  const [hover, setHover] = useState<{ x: number; y: number; wd: number; h: number } | null>(null)

  const { grid, max } = useMemo(() => {
    const g: number[][] = Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0))
    let m = 0
    for (const ms of starts) {
      const d = new Date(ms)
      if (!Number.isFinite(d.getTime())) continue
      const count = ++g[weekdayIndex(d)]![d.getHours()]!
      if (count > m) m = count
    }
    return { grid: g, max: m }
  }, [starts])

  if (!starts.length) return <p className="empty-note">No runs in this period.</p>

  const hovered = hover ? grid[hover.wd]![hover.h]! : null
  const gridCols = { display: 'grid', gridTemplateColumns: '2.25rem repeat(24, minmax(0, 1fr))', alignItems: 'center' } as const

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', marginBottom: 10, gap: 5, fontSize: 'var(--fs-micro)', color: 'var(--mut)' }}>
        Fewer
        {[0.12, 0.4, 0.7, 1].map(dot => (
          <span key={dot} style={{ width: 5 + dot * 7, height: 5 + dot * 7, borderRadius: '50%', background: 'var(--accent)', opacity: 0.35 + dot * 0.65 }} />
        ))}
        More
      </div>
      <div style={{ overflowX: 'auto' }}>
        <div ref={wrapRef} style={{ position: 'relative', minWidth: 560 }} onMouseLeave={() => setHover(null)}>
          <div style={gridCols}>
            <span />
            {HOURS.map(h => (
              <span key={h} style={{ paddingBottom: 3, textAlign: 'center', fontSize: 'var(--fs-micro)', fontVariantNumeric: 'tabular-nums', color: 'var(--mut)' }}>
                {h % 3 === 0 ? h : ''}
              </span>
            ))}
          </div>
          {WEEKDAYS.map((wdLabel, wd) => (
            <div key={wd} style={gridCols}>
              <span style={{ paddingRight: 8, textAlign: 'right', fontSize: 'var(--fs-micro)', fontVariantNumeric: 'tabular-nums', color: 'var(--mut)' }}>{wdLabel}</span>
              {HOURS.map(h => {
                const count = grid[wd]![h]!
                const level = intensity(count, max)
                const active = hover?.wd === wd && hover?.h === h
                const track = (event: React.MouseEvent) => {
                  if (!count || !wrapRef.current) return
                  const r = wrapRef.current.getBoundingClientRect()
                  const x = Math.min(Math.max(event.clientX - r.left, 70), r.width - 70)
                  setHover({ x, y: event.clientY - r.top, wd, h })
                }
                return (
                  <div key={h} style={{ aspectRatio: '1', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 2 }} onMouseEnter={track} onMouseMove={track}>
                    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: 3, background: count ? 'var(--hover)' : 'transparent' }}>
                      {count > 0 && (
                        <div style={{
                          width: `${22 + level * 70}%`, height: `${22 + level * 70}%`, borderRadius: '50%',
                          background: 'var(--accent)', opacity: 0.45 + level * 0.55,
                          transform: active ? 'scale(1.18)' : undefined, transition: 'transform 120ms',
                        }} />
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          ))}
          {hover && hovered != null && (
            <div style={{
              pointerEvents: 'none', position: 'absolute', zIndex: 10, left: hover.x,
              top: hover.y < 56 ? hover.y + 14 : hover.y - 8,
              transform: hover.y < 56 ? 'translate(-50%, 0)' : 'translate(-50%, -100%)',
              borderRadius: 8, border: '1px solid var(--line)',
              background: 'var(--card-inner)', padding: '5px 10px', fontSize: 'var(--fs-meta)', boxShadow: 'var(--card-shadow)',
            }}>
              <div style={{ fontWeight: 'var(--fw-medium)' as never, color: 'var(--ink)' }}>{WEEKDAYS_FULL[hover.wd]} {String(hover.h).padStart(2, '0')}:00</div>
              <div style={{ fontVariantNumeric: 'tabular-nums', color: 'var(--mut)' }}>{hovered} {hovered === 1 ? 'run' : 'runs'}</div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
