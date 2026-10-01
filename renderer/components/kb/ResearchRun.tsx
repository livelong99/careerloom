import { Check, ExternalLink, Square } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { ResearchPhase, ResearchProgress } from '../../../electron/kb/types'
import { clock, usd } from './format'

const STEPS: Array<{ label: string; phases: ResearchPhase[]; unit: string }> = [
  { label: 'Plan queries', phases: ['plan'], unit: 'queries' }, { label: 'Search', phases: ['search'], unit: '' }, { label: 'Read pages', phases: ['fetch'], unit: '' },
  { label: 'Extract questions', phases: ['extract'], unit: '' }, { label: 'Dedupe & rank', phases: ['dedupe'], unit: '' }, { label: 'Write outlines', phases: ['generate', 'commit'], unit: '' },
]
const stepOf = (p: ResearchPhase): number => STEPS.findIndex(s => s.phases.includes(p))

type Props = { jobTitle: string; progress: ResearchProgress | null; budgetUsd: number; onStop: () => void; onOpenRun: () => void }

/** Live stepper (`role=status`, polite): per-step bars, elapsed, spend vs cap. The partial bank stays browsable below it. */
export function ResearchRun({ jobTitle, progress, budgetUsd, onStop, onOpenRun }: Props) {
  const now = progress ? stepOf(progress.phase) : -1
  return (
    <div role="status" aria-live="polite" className="mb-3 rounded-lg border border-border bg-card px-4 py-3.5 shadow-sm">
      <div className="flex items-center gap-2.5">
        <b className="text-[15px]">Researching {jobTitle}</b>
        <Badge variant="brand">{now < 0 ? 'Starting' : `Step ${now + 1} of ${STEPS.length}`}</Badge>
        <span className="flex-1" />
        <button type="button" onClick={onOpenRun} className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent font-medium text-brand-text hover:underline">View run in Runs <ExternalLink aria-hidden className="size-3.5" /></button>
        <Button size="sm" variant="destructive" onClick={onStop}><Square aria-hidden />Stop</Button>
      </div>
      <ol className="m-0 mt-2.5 grid text-sm list-none gap-0.5 p-0">
        {STEPS.map((s, i) => {
          const done = i < now, cur = i === now
          const pct = done ? 100 : cur && progress ? (progress.total ? Math.min(100, (progress.done / progress.total) * 100) : 0) : 0
          return (
            <li key={s.label} aria-current={cur ? 'step' : undefined} className={`grid grid-cols-[22px_150px_1fr_auto] items-center gap-2.5 py-1.5 ${done || cur ? 'text-foreground' : 'text-muted-foreground'} ${cur ? 'font-semibold' : ''}`}>
              <span aria-hidden className={`grid size-[18px] place-items-center rounded-full ${done ? 'bg-success text-white' : cur ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>{done && <Check className="size-3" />}</span>
              <span>{s.label}<span className="sr-only">{done ? ' (done)' : cur ? ' (in progress)' : ''}</span></span>
              <span aria-hidden className="h-1 overflow-hidden rounded-full bg-foreground/10"><i className="block h-full bg-primary transition-[width]" style={{ width: `${pct}%` }} /></span>
              <small className="w-20 text-right tabular-nums text-muted-foreground">{done || cur ? (progress && cur ? `${progress.done} / ${progress.total}` : done ? 'Done' : '') : ''}</small>
            </li>
          )
        })}
      </ol>
      {progress && (
        <div className="mt-2.5 flex flex-wrap gap-x-[18px] gap-y-1 text-[12.5px] text-muted-foreground">
          <span>Elapsed <b className="tabular-nums text-foreground">{clock(progress.elapsedMs)}</b></span>
          <span>Spent <b className="tabular-nums text-foreground">{usd(progress.spentUsd)}</b> of {usd(budgetUsd)}</span>
          <span>Pages read <b className="tabular-nums text-foreground">{progress.pages}</b></span>
          <span>Questions found so far <b className="tabular-nums text-foreground">{progress.itemsFound}</b></span>
          {progress.skipped > 0 && <span>Skipped <b className="tabular-nums text-foreground">{progress.skipped}</b></span>}
        </div>
      )}
    </div>
  )
}
