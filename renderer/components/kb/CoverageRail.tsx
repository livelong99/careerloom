import type { KbCoverage } from '../../../electron/kb/types'

/** One tile per skill node; click filters the bank to that skill. Amber/dashed = fewer questions than needed (same colour as the thread). */
export function CoverageRail({ coverage, active, onPick }: { coverage: KbCoverage[]; active: string; onPick: (skillId: string) => void }) {
  if (!coverage.length) return null
  return (
    <div role="group" aria-label="Coverage by skill" className="mb-3 grid grid-cols-[repeat(auto-fill,minmax(168px,1fr))] gap-2">
      {coverage.map(c => {
        const short = c.have < c.need
        const on = active === c.skillId
        return (
          <button key={c.skillId} type="button" aria-pressed={on} onClick={() => onPick(on ? 'all' : c.skillId)}
            className={`grid cursor-pointer gap-1.5 rounded-md border bg-card px-2.5 py-2 text-left hover:border-primary ${on ? 'border-primary shadow-[0_0_0_1px_var(--accent)_inset]' : 'border-border'}`}>
            <span className="flex justify-between text-[13px] font-semibold">{c.name}<span className="font-medium tabular-nums text-muted-foreground">{c.have}</span></span>
            <span aria-hidden className="h-1 overflow-hidden rounded-full bg-foreground/10"><i className={`block h-full ${short ? 'bg-thread' : 'bg-primary'}`} style={{ width: `${Math.min(100, (c.have / Math.max(1, c.need)) * 100)}%` }} /></span>
            <span className={`text-[11.5px] ${short ? 'text-[var(--thread-text)]' : 'text-muted-foreground'}`}>
              {short ? `Need ${c.need - c.have} more` : 'Covered'} · {c.expected} expected{c.inCv ? '' : ' · not on your résumé'}
            </span>
          </button>
        )
      })}
    </div>
  )
}
