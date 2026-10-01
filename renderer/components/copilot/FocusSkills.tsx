import { cn } from '@/lib/utils'

export type FocusSkill = { id: string; name: string; /** not on the résumé */ gap: boolean }

/** Skill chips that are practised first. Dashed = a gap from the evaluation (also said in words for assistive tech). */
export function FocusSkills({ skills, value, onChange }: { skills: FocusSkill[]; value: string[]; onChange: (ids: string[]) => void }) {
  if (skills.length === 0) return <p className="m-0 text-xs text-muted-foreground">Skills appear here once this job has a question base.</p>
  const toggle = (id: string): void => onChange(value.includes(id) ? value.filter(v => v !== id) : [...value, id])
  return (
    <div role="group" aria-label="Focus skills" className="flex flex-wrap gap-2">
      {skills.map(s => {
        const on = value.includes(s.id)
        return (
          <button
            key={s.id} type="button" aria-pressed={on} onClick={() => toggle(s.id)} style={s.gap ? { borderStyle: 'dashed' } : undefined}
            className={cn('inline-flex h-8 items-center gap-1 rounded-full border px-3 text-xs font-medium outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50', on ? 'border-primary bg-primary/10 text-foreground' : 'border-border text-muted-foreground hover:bg-accent/40')}
          >
            {s.name}{s.gap && <span className="sr-only"> (gap on your résumé)</span>}
          </button>
        )
      })}
    </div>
  )
}
