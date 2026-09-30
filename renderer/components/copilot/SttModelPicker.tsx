import { cn } from '@/lib/utils'
import { Chip } from './hwControls'

export type SttRow = { model: string; label: string; hint: string; sizeMb: number | null; installed: boolean | null; p50FinalMs: number | null; recommended: boolean }

/** Model choice as a radio list; each row says what it is, how big, whether it is installed and how fast it measured on this computer. */
export function SttModelPicker({ rows, value, onChange }: { rows: SttRow[]; value: string | null; onChange: (model: string) => void }) {
  return (
    <div role="radiogroup" aria-label="Speech model" className="flex flex-col gap-2">
      {rows.map(r => {
        const on = r.model === value
        return (
          <button
            key={r.model} type="button" role="radio" aria-checked={on} onClick={() => onChange(r.model)}
            className={cn('flex w-full cursor-pointer items-center justify-between gap-3 rounded-lg border px-3 py-2 text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50', on ? 'border-(--accent,currentColor) bg-primary/[0.06]' : 'border-border bg-transparent hover:bg-muted/50')}
          >
            <span className="min-w-0">
              <span className="block text-sm font-medium text-foreground">{r.label}</span>
              <span className="block text-xs text-muted-foreground">{r.sizeMb === null ? 'size shown after install' : `about ${r.sizeMb} MB`} · {r.hint}</span>
            </span>
            <span className="flex shrink-0 items-center gap-1.5">
              {r.p50FinalMs !== null && <Chip>Final in {Math.round(r.p50FinalMs)} ms</Chip>}
              {r.recommended && <Chip tone="brand">Recommended</Chip>}
              {r.installed !== null && (r.installed ? <Chip tone="ok">Installed</Chip> : <Chip tone="warn">Not installed</Chip>)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
