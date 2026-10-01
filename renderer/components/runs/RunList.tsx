import { useState, type KeyboardEvent } from 'react'

import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { formatCompact, formatDuration, formatUsd } from '../../lib/format'
import { EMPTY_FILTER, KINDS, elapsedMs, kindOf, moveSelection, type RunFilter } from '../../lib/runsView'
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

type Props = {
  runs: Run[]
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
export function RunList({ runs, total, runners, filter, onFilter, selected, onSelect, now }: Props) {
  const [shown, setShown] = useState(PAGE)
  const set = (patch: Partial<RunFilter>) => { setShown(PAGE); onFilter({ ...filter, ...patch }) }
  const visible = runs.slice(0, shown)
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
      <p className="m-0 text-xs text-muted-foreground" aria-live="polite">
        {runs.length === total ? `${total.toLocaleString()} runs` : `${runs.length.toLocaleString()} of ${total.toLocaleString()} runs`}
        {filtered && <> · <button type="button" className="cursor-pointer border-0 bg-transparent p-0 text-xs text-[var(--accent-text)] underline" onClick={() => { setShown(PAGE); onFilter(EMPTY_FILTER) }}>Clear filters</button></>}
      </p>
      <div
        role="listbox" aria-label="Runs" tabIndex={0} aria-activedescendant={selected ? `run-opt-${selected}` : undefined} onKeyDown={onKeyDown}
        className="-mx-1 flex min-h-0 flex-1 flex-col gap-1 overflow-y-auto px-1 outline-none focus-visible:ring-2 focus-visible:ring-ring/70"
      >
        {visible.length === 0 && <p className="m-0 p-3 text-sm text-muted-foreground">No runs match these filters.</p>}
        {visible.map(r => {
          const tokens = r.usage ? r.usage.inputTokens + r.usage.outputTokens : 0
          return (
            <div
              key={r.id} id={`run-opt-${r.id}`} role="option" aria-selected={r.id === selected} onClick={() => onSelect(r.id)}
              className={`cursor-pointer rounded-lg border px-3 py-2 ${r.id === selected ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_8%,transparent)]' : 'border-transparent hover:bg-muted/50'}`}
            >
              <div className="flex items-center gap-2">
                <span className="min-w-0 flex-1 truncate text-sm font-medium">{r.label}</span>
                <span className={`run-status ${r.status}`}>{r.status}</span>
              </div>
              <div className="mt-0.5 flex gap-2 text-xs text-muted-foreground">
                <span>{kindOf(r)} · {r.runner}</span>
                <span className="flex-1 truncate">{new Date(r.startedAt).toLocaleString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                <span className="tabular-nums">{r.status === 'running' ? `${formatDuration(elapsedMs(r, now))}…` : formatDuration(elapsedMs(r))}</span>
                {r.usage && <span className="tabular-nums">{r.usage.costUsd != null ? formatUsd(r.usage.costUsd) : `${formatCompact(tokens)} tok`}</span>}
              </div>
            </div>
          )
        })}
        {runs.length > shown && <button type="button" className="btnp" onClick={() => setShown(s => s + PAGE)}>Show {Math.min(PAGE, runs.length - shown)} more</button>}
      </div>
    </div>
  )
}
