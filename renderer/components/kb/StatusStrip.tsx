import { ExternalLink, Play, Plus, RefreshCw, Download } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'

import type { KbSummary } from '../../../electron/kb/types'
import { researchedLabel, usd } from './format'

const BADGE: Record<string, [string, 'success' | 'warn' | 'danger' | 'neutral']> = {
  complete: ['Up to date', 'success'], partial: ['Partial', 'warn'], stale: ['Stale', 'warn'], failed: ['Failed', 'danger'],
}

type Props = {
  summary: KbSummary; offline: boolean; locked: boolean; hasItems: boolean
  onRefresh: () => void; onAdd: () => void; onPractise: () => void; onExport: () => void; onOpenRun: () => void
}

/** Status badge, the facts, and the four actions. Refresh is a suggestion, never automatic (design §3.1). */
export function StatusStrip({ summary, offline, locked, hasItems, onRefresh, onAdd, onPractise, onExport, onOpenRun }: Props) {
  const [label, tone] = summary.status === 'partial' && summary.inputChanged ? BADGE.stale! : BADGE[summary.status] ?? ['Not researched', 'neutral']
  return (
    <div className="mb-3 flex flex-wrap items-center gap-3.5 rounded-lg border border-border bg-card px-3.5 py-3 shadow-sm">
      <Badge variant={tone}>{label}</Badge>
      <dl className="m-0 flex flex-wrap gap-x-4 gap-y-1 text-[12.5px] text-muted-foreground">
        {([['Researched', researchedLabel(summary.researchedAt)], ['', `${summary.items} questions`], ['', `${summary.sourcedPct}% sourced`], ['', `${summary.sources} sources`], ['Cost', usd(summary.costUsd)]] as const).map(([k, v]) => (
          <div key={v} className="flex gap-1"><dt className={k ? '' : 'sr-only'}>{k || 'Count'}</dt><dd className="m-0 font-semibold tabular-nums text-foreground">{v}</dd></div>
        ))}
      </dl>
      <span className="flex-1" />
      {summary.runId && <button type="button" onClick={onOpenRun} className="inline-flex cursor-pointer items-center gap-1 border-0 bg-transparent font-medium text-brand-text hover:underline">Run in Runs <ExternalLink aria-hidden className="size-3.5" /></button>}
      <Button size="sm" variant="outline" onClick={onRefresh} disabled={offline || locked} title={offline ? 'You’re offline. Refresh when you’re back online.' : locked ? 'Agree to web research first' : undefined}><RefreshCw aria-hidden />Refresh</Button>
      <Button size="sm" variant="outline" onClick={onAdd}><Plus aria-hidden />Add question</Button>
      {hasItems && <Button size="sm" variant="outline" onClick={onExport}><Download aria-hidden />Export</Button>}
      <Button size="sm" onClick={onPractise} disabled={!hasItems}><Play aria-hidden />Practise this job</Button>
    </div>
  )
}
