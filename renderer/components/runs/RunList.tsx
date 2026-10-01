import { useState, type KeyboardEvent } from 'react'

import { Input } from '@/components/ui/input'
import { SegTabs } from '../SegTabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCompact, formatDuration, formatUsd } from '../../lib/format'
import { openJob } from '../../lib/jobNav'
import { EMPTY_FILTER, KINDS, elapsedMs, kindOf, moveSelection, type JobOf, type RunFilter, type RunGroup, type RunGroupBy } from '../../lib/runsView'
import type { Run } from '../../lib/types'

const PAGE = 200
const STATUSES = ['running', 'done', 'failed', 'cancelled'] as const
const RANGES: Array<[RunFilter['range'], string]> = [['all', 'Any time'], ['today', 'Today'], ['7d', 'Last 7 days'], ['30d', 'Last 30 days']]

function Filter({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: Array<[string, string]> }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger size="sm" aria-label={label} className="h-8 min-w-0 flex-1 text-xs"><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(([v, l]) => <SelectItem key={v} value={v}>{l}</SelectItem>)}</SelectContent>
    </Select>
  )
}

const GROUPS: Array<{ value: RunGroupBy; label: string }> = [{ value: 'none', label: 'None' }, { value: 'job', label: 'Job' }, { value: 'status', label: 'Status' }]

type Props = {
  /** The filtered runs, already grouped (one group when grouping is off). */
  groups: RunGroup[]
  jobOf: JobOf
  /** Jobs that have runs, for the Job filter. */
  jobOptions: Array<[string, string]>
  group: RunGroupBy
  onGroup: (g: RunGroupBy) => void
  total: number
  /** Every runner that appears in history (not just in the filtered rows). */
  runners: string[]
  filter: RunFilter
  onFilter: (f: RunFilter) => void
  selected: string | null
  onSelect: (id: string) => void
  now: number
}

/** Filter bar + keyboard-driven listbox (↑ ↓ Home End move the selection; the detail pane follows it). */
export function RunList({ groups, jobOf, jobOptions, group, onGroup, total, runners, filter, onFilter, selected, onSelect, now }: Props) {
  const [shown, setShown] = useState(PAGE)
  const set = (patch: Partial<RunFilter>) => { setShown(PAGE); onFilter({ ...filter, ...patch }) }
  const count = groups.reduce((n, g) => n + g.runs.length, 0)
  let budget = shown
  const pageGroups = groups.map(g => { const runs = g.runs.slice(0, budget); budget -= runs.length; return { ...g, runs } }).filter(g => g.runs.length)
  const visible = pageGroups.flatMap(g => g.runs)
  const filtered = JSON.stringify(filter) !== JSON.stringify(EMPTY_FILTER)

  const onKeyDown = (e: KeyboardEvent) => {
    const move = e.key === 'ArrowDown' ? 1 : e.key === 'ArrowUp' ? -1 : e.key === 'Home' ? 'start' : e.key === 'End' ? 'end' : null
    if (move === null) return
    e.preventDefault()
    const next = moveSelection(visible.map(r => r.id), selected, move)
    if (next) { onSelect(next); document.getElementById(`run-opt-${next}`)?.scrollIntoView?.({ block: 'nearest' }) }
  }

  return (
    <div className="flex min-h-0 flex-col gap-2 p-3">
      <Input type="search" aria-label="Search runs" placeholder="Search label, input, mode…" value={filter.q} onChange={e => set({ q: e.target.value })} />
      <div className="flex gap-2">
        <Filter label="Status" value={filter.status} onChange={v => set({ status: v as RunFilter['status'] })} options={[['all', 'Any status'], ...STATUSES.map(s => [s, s] as [string, string])]} />
        <Filter label="Runner" value={filter.runner} onChange={v => set({ runner: v })} options={[['all', 'Any runner'], ...runners.map(r => [r, r] as [string, string])]} />
      </div>
      <div className="flex gap-2">
        <Filter label="Type" value={filter.kind} onChange={v => set({ kind: v })} options={[['all', 'Any type'], ...KINDS.map(k => [k, k] as [string, string])]} />
        <Filter label="Date" value={filter.range} onChange={v => set({ range: v as RunFilter['range'] })} options={RANGES} />
      </div>
      <div className="flex gap-2">
        <Filter label="Job" value={filter.job} onChange={v => set({ job: v })} options={[['all', 'Any job'], ['none', 'No job'], ...jobOptions]} />
      </div>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span id="runs-group-label">Group by</span>
        <SegTabs options={GROUPS} value={group} onChange={v => onGroup(v as RunGroupBy)} />
      </div>
      <p className="m-0 text-xs text-muted-foreground" aria-live="polite">
        {count === total ? `${total.toLocaleString()} runs` : `${count.toLocaleString()} of ${total.toLocaleString()} runs`}
        {filtered && <> · <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-xs text-[var(--accent-text)] underline" onClick={() => { setShown(PAGE); onFilter(EMPTY_FILTER) }}>Clear filters</button></>}
      </p>
      <div
        role="listbox" aria-label="Runs" tabIndex={0} aria-activedescendant={selected ? `run-opt-${selected}` : undefined} onKeyDown={onKeyDown}
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
      >
        {visible.length === 0 && <p className="m-0 p-3 text-sm text-muted-foreground">No runs match these filters.</p>}
        {pageGroups.map(g => (
          <div key={g.key} role={group === 'none' ? 'presentation' : 'group'} aria-labelledby={group === 'none' ? undefined : `run-group-${g.key}`} className="flex flex-col gap-1">
            {group !== 'none' && (
              <div id={`run-group-${g.key}`} className="sticky top-0 z-[1] flex items-center gap-2 bg-[var(--panel)] px-1 pt-1.5 pb-0.5 text-xs font-medium text-muted-foreground">
                <span className="min-w-0 flex-1 truncate">{g.title}</span>
                <span className="tabular-nums">{g.runs.length}</span>
                {g.job && <button type="button" aria-label={`Open job ${g.title}`} className="cursor-pointer border-0 bg-transparent p-0 text-xs text-[var(--accent-text)] underline" onClick={() => openJob(g.job!.id)}>Open job</button>}
              </div>
            )}
            {g.runs.map(r => <Row key={r.id} run={r} selected={r.id === selected} onSelect={onSelect} now={now} jobTitle={group === 'job' ? null : jobOf(r)} />)}
          </div>
        ))}
        {count > shown && <button type="button" className="btnp" onClick={() => setShown(s => s + PAGE)}>Show {Math.min(PAGE, count - shown)} more</button>}
      </div>
    </div>
  )
}

function Row({ run: r, selected, onSelect, now, jobTitle }: { run: Run; selected: boolean; onSelect: (id: string) => void; now: number; jobTitle: { id: string; title: string; company: string } | null }) {
  const tokens = r.usage ? r.usage.inputTokens + r.usage.outputTokens : 0
  return (
    <div
      id={`run-opt-${r.id}`} role="option" aria-selected={selected} onClick={() => onSelect(r.id)}
      className={`cursor-pointer rounded-lg border px-3 py-2 ${selected ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]' : 'border-transparent hover:bg-muted/50'}`}
    >
      <div className="flex items-center gap-2">
        <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.label}</span>
        <span className={`run-status ${r.status}`}>{r.status}</span>
      </div>
      {jobTitle && (
        <div className="mt-0.5 flex items-center gap-2 text-xs">
          <span className="min-w-0 flex-1 truncate text-muted-foreground">{jobTitle.title} — {jobTitle.company}</span>
          <button type="button" tabIndex={-1} aria-label={`Open job ${jobTitle.title} — ${jobTitle.company}`} className="cursor-pointer border-0 bg-transparent p-0 text-xs text-[var(--accent-text)] underline" onClick={e => { e.stopPropagation(); openJob(jobTitle.id) }}>Open job</button>
        </div>
      )}
      <div className="mt-0.5 flex gap-2 text-xs text-muted-foreground">
        <span>{kindOf(r)} · {r.runner}</span>
        <span className="flex-1 truncate">{new Date(r.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        <span className="tabular-nums">{r.status === 'running' ? `${formatDuration(elapsedMs(r, now))}…` : formatDuration(elapsedMs(r))}</span>
        {r.usage && <span className="tabular-nums">{r.usage.costUsd != null ? formatUsd(r.usage.costUsd) : `${formatCompact(tokens)} tok`}</span>}
      </div>
    </div>
  )
}
