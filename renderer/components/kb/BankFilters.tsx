import { ToggleSwitch } from '@/components/ui/toggle-switch'

import type { KbCoverage, KbItemView, KbQuestionType } from '../../../electron/kb/types'
import { type BankFilter, NO_FILTER, ORIGIN_LABEL, TYPE_LABEL } from './filter'

export const selectCls = 'h-8 min-w-[110px] rounded-md border border-border bg-background px-2 text-[13px] text-foreground outline-none focus-visible:ring-[3px] focus-visible:ring-ring/60'
const segCls = (on: boolean): string => `h-7 cursor-pointer rounded-md border px-2.5 text-[12.5px] font-medium ${on ? 'border-primary bg-primary/[0.12] text-brand-text' : 'border-border bg-card text-foreground hover:bg-muted'}`

type Props = {
  value: BankFilter; onChange: (f: BankFilter) => void; items: KbItemView[]; coverage: KbCoverage[]
  hiddenCount: number; showHidden: boolean; onShowHidden: (v: boolean) => void
}

export function BankFilters({ value, onChange, items, coverage, hiddenCount, showHidden, onShowHidden }: Props) {
  const set = (p: Partial<BankFilter>): void => onChange({ ...value, ...p })
  const types = [...new Set(items.map(i => i.type))] as KbQuestionType[]
  const skills = new Map(coverage.map(c => [c.skillId, c.name])); items.forEach(i => i.skills.forEach(s => { if (!skills.has(s)) skills.set(s, s) }))
  return (
    <>
      <div className="mb-2.5 flex flex-wrap items-center gap-2">
        <div role="group" aria-label="Type" className="flex flex-wrap gap-1">
          {(['all', ...types] as const).map(t => <button key={t} type="button" aria-pressed={value.type === t} className={segCls(value.type === t)} onClick={() => set({ type: t })}>{t === 'all' ? 'All' : TYPE_LABEL[t]}</button>)}
        </div>
        <select aria-label="Skill" className={selectCls} value={value.skill} onChange={e => set({ skill: e.target.value })}>
          <option value="all">All skills</option>{[...skills].map(([id, name]) => <option key={id} value={id}>{name}</option>)}
        </select>
        <select aria-label="Difficulty" className={selectCls} value={value.difficulty} onChange={e => set({ difficulty: e.target.value as BankFilter['difficulty'] })}>
          <option value="any">Any difficulty</option><option value="easy">Easier (1–2)</option><option value="mid">Medium (3)</option><option value="hard">Harder (4–5)</option>
        </select>
        <select aria-label="Source" className={selectCls} value={value.source} onChange={e => set({ source: e.target.value as BankFilter['source'] })}>
          <option value="all">Any source</option>{(Object.keys(ORIGIN_LABEL) as Array<keyof typeof ORIGIN_LABEL>).map(o => <option key={o} value={o}>{ORIGIN_LABEL[o]}</option>)}
        </select>
        <input type="search" aria-label="Search questions" placeholder="Search questions" className={`${selectCls} min-w-[150px]`} value={value.text} onChange={e => set({ text: e.target.value })} />
        <span className="flex-1" />
        {hiddenCount > 0 && <label className="flex items-center gap-2 text-[13px]"><ToggleSwitch checked={showHidden} onCheckedChange={onShowHidden} aria-label="Show hidden questions" />Show hidden ({hiddenCount})</label>}
        <label className="flex items-center gap-2 text-[13px]"><ToggleSwitch checked={value.hideGenerated} onCheckedChange={v => set({ hideGenerated: v })} aria-label="Hide generated questions" />Hide generated</label>
        {JSON.stringify(value) !== JSON.stringify(NO_FILTER) && <button type="button" className="cursor-pointer border-0 bg-transparent text-[13px] font-medium text-brand-text hover:underline" onClick={() => onChange(NO_FILTER)}>Clear filters</button>}
      </div>
      <div className="mb-2 flex flex-wrap items-center gap-3 text-xs text-muted-foreground" aria-label="Legend">
        <span><i aria-hidden className="mr-1.5 inline-block h-3.5 w-[3px] rounded-sm bg-[var(--accent)] align-[-2px]" />Sourced — has a link</span>
        <span><i aria-hidden className="mr-1.5 inline-block h-3.5 w-[3px] rounded-sm align-[-2px] [background:repeating-linear-gradient(var(--thread)_0_3px,transparent_3px_5px)]" />Generated — no source, treat as practice only</span>
        <span><i aria-hidden className="mr-1.5 inline-block h-3.5 w-[3px] rounded-sm bg-[var(--s-premium)] align-[-2px]" />Yours</span>
      </div>
    </>
  )
}
