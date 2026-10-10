import { rate, type PipelineStage } from '../../lib/overviewData'

const pct = (r: number | null) => (r === null ? '—' : `${Math.round(r * 100)}%`)
const W = 700
const H = 120

/** Hero: found → offer as a tapering band. Band height is sqrt-scaled so the late, tiny stages stay visible; each stage is a button into Jobs. */
export function Pipeline({ stages, onStage }: { stages: PipelineStage[]; onStage: (id: PipelineStage['id']) => void }) {
  const max = Math.max(1, ...stages.map(s => s.count))
  const half = (c: number) => (c <= 0 ? 1.5 : Math.max(4, Math.sqrt(c / max) * (H / 2 - 4)))
  const colW = W / stages.length
  const top = stages.map((s, i) => [colW * (i + 0.5), H / 2 - half(s.count)] as const)
  const bot = stages.map((s, i) => [colW * (i + 0.5), H / 2 + half(s.count)] as const)
  const edge = (pts: ReadonlyArray<readonly [number, number]>) => pts.slice(1).map(([x, y], i) => {
    const [px, py] = pts[i]!; const mx = (px + x) / 2
    return `C${mx},${py} ${mx},${y} ${x},${y}`
  }).join(' ')
  const d = `M${top[0]![0]},${top[0]![1]} ${edge(top)} L${bot[bot.length - 1]![0]},${bot[bot.length - 1]![1]} ${edge([...bot].reverse())} Z`
  return (
    <div className="ovx-pipe">
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="ovx-pipe-svg" aria-hidden="true">
        <defs>
          <linearGradient id="ovx-pipe-grad" x1="0" x2="1">
            <stop offset="0" stopColor="var(--accent)" stopOpacity=".28" />
            <stop offset="1" stopColor="var(--thread)" stopOpacity=".5" />
          </linearGradient>
        </defs>
        <path d={d} fill="url(#ovx-pipe-grad)" stroke="var(--accent)" strokeOpacity=".55" strokeWidth="1" vectorEffect="non-scaling-stroke" />
      </svg>
      <ol className="ovx-pipe-stages">
        {stages.map((s, i) => {
          const prev = i > 0 ? stages[i - 1]! : null
          const conv = prev ? rate(s.count, prev.count) : null
          return (
            <li key={s.id}>
              <button type="button" className="ovx-stage" onClick={() => onStage(s.id)} aria-label={`${s.label}: ${s.count}${prev ? `, ${pct(conv)} of ${prev.label}` : ''}. Show in Jobs`}>
                <span className="ovx-stage-n">{s.count.toLocaleString()}</span>
                <span className="ovx-stage-l">{s.label}</span>
                <span className="ovx-stage-c">{prev ? `${pct(conv)} of ${prev.label.toLowerCase()}` : 'in range'}</span>
              </button>
            </li>
          )
        })}
      </ol>
    </div>
  )
}
