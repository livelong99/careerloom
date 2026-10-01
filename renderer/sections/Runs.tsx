import { useEffect, useMemo, useState } from 'react'

import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { RunDetail, useNow } from '../components/runs/RunDetail'
import { RunList } from '../components/runs/RunList'
import { SettingChip } from '../components/settings/SettingChip'
import { SectionSkeleton } from '../components/Skeleton'
import { usePolled } from '../hooks/usePolled'
import { useRuns } from '../hooks/useRuns'
import { careerloom, normalizeCliError } from '../lib/ipc'
import { formatCompact, formatCount, formatUsd } from '../lib/format'
import { EMPTY_FILTER, filterRuns, groupRuns, indexJobs, runTotals, type RunFilter, type RunGroupBy } from '../lib/runsView'
import { showToast } from '../lib/toast'
import type { Run } from '../lib/types'

const DAY = 86_400_000
type Clear = { label: string; ids: string[] }

/** Every run, whichever screen started it: a filterable history on the left, the selected run's detail and log on the right. */
export function Runs({ focusId, onFocusHandled }: { focusId?: string | null; onFocusHandled?: () => void }) {
  const { runs, loaded, generation, cancel, start, evaluate, forget } = useRuns()
  const [filter, setFilter] = useState<RunFilter>(EMPTY_FILTER)
  const [group, setGroup] = useState<RunGroupBy>('none')
  const [selected, setSelected] = useState<string | null>(null)
  const [clear, setClear] = useState<Clear | null>(null)
  const now = useNow(runs.some(r => r.status === 'running'))

  // A deep link ("View log" on a scan) selects that run and drops any filter that would hide it.
  useEffect(() => {
    if (!focusId || !loaded) return
    setFilter(EMPTY_FILTER)
    setSelected(focusId)
    onFocusHandled?.()
  }, [focusId, loaded, onFocusHandled])

  const settings = usePolled(() => careerloom.getSettings(), [], { intervalMs: null })
  const jobs = usePolled(() => careerloom.listJobs(), [generation], { intervalMs: null })
  const modes = usePolled(() => careerloom.modes(), [], { intervalMs: null })
  const jobOf = useMemo(() => indexJobs(jobs.data ?? []), [jobs.data])
  const shown = useMemo(() => filterRuns(runs, filter, Date.now(), jobOf), [runs, filter, jobOf])
  const groups = useMemo(() => groupRuns(shown, group, jobOf), [shown, group, jobOf])
  const flat = useMemo(() => groups.flatMap(g => g.runs), [groups])
  const totals = useMemo(() => runTotals(runs), [runs])
  const runners = useMemo(() => [...new Set(runs.map(r => r.runner))], [runs])
  // The Job filter offers the jobs that have runs, most recently active first.
  const jobOptions = useMemo(() => groupRuns(runs, 'job', jobOf).filter(g => g.job).slice(0, 200).map(g => [g.key, g.title] as [string, string]), [runs, jobOf])
  const active = flat.find(r => r.id === selected) ?? (focusId ? null : flat[0] ?? null)
  const activeJob = active ? jobOf(active) : null
  const jobRuns = useMemo(() => (activeJob ? groupRuns(runs, 'job', jobOf).find(g => g.key === activeJob.id)?.runs ?? [] : []), [runs, jobOf, activeJob])
  const days = settings.data?.prefs.retention.runLogDays ?? null

  const rerun = async (r: Run) => {
    const next = r.mode === 'evaluate' && r.input ? await evaluate(r.input) : await start(r.mode, r.input ?? undefined)
    if (next) { setFilter(EMPTY_FILTER); setSelected(next.id) }
  }
  const remove = async (ids: string[]) => {
    try {
      const n = await forget(ids)
      showToast(n ? `Deleted ${formatCount(n, 'run')}` : 'Nothing to delete — running runs are kept')
    } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) }
  }
  const finished = runs.filter(r => r.status !== 'running')
  const askClear = (label: string, ids: string[]) => ids.length ? setClear({ label, ids }) : showToast('No finished runs match')

  if (!loaded) return <SectionSkeleton label="Loading runs" rows={6} />
  return (
    <div className="workspace workspace-fill flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2" role="group" aria-label="Run totals">
        <Total label="Today" value={String(totals.today)} />
        <Total label="Running" value={String(totals.running)} />
        <Total label="Failed (all)" value={String(totals.failed)} tone={totals.failed ? 'bad' : undefined} />
        <Total label="Spend (all)" value={formatUsd(totals.costUsd)} />
        <Total label="Tokens (all)" value={formatCompact(totals.tokens)} />
        <span className="flex-1" />
        <SettingChip label="Log retention" value={days === null ? 'forever' : `${days} days`} page="monitoring" />
        <DropdownMenu>
          <DropdownMenuTrigger asChild><Button size="sm" variant="outline" disabled={!finished.length}>Clear…</Button></DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => askClear('finished runs older than 30 days', finished.filter(r => r.startedAt < Date.now() - 30 * DAY).map(r => r.id))}>Older than 30 days</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => askClear('failed and cancelled runs', finished.filter(r => r.status !== 'done').map(r => r.id))}>Failed and cancelled</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => askClear('all finished runs', finished.map(r => r.id))}>All finished runs</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {runs.length === 0
        ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-1 rounded-xl border border-border text-center">
            <b>Nothing has run yet</b>
            <span className="text-sm text-muted-foreground">Evaluate a job or scan your boards and it shows up here, live.</span>
          </div>
        )
        : (
          <div className="grid min-h-0 flex-1 grid-cols-[minmax(300px,380px)_minmax(0,1fr)] overflow-hidden rounded-xl border border-border">
            <div className="flex min-h-0 flex-col border-r border-border">
              <RunList groups={groups} jobOf={jobOf} jobOptions={jobOptions} group={group} onGroup={setGroup} total={runs.length} runners={runners} filter={filter} onFilter={setFilter} selected={active?.id ?? null} onSelect={setSelected} now={now} />
            </div>
            {active
              ? <RunDetail key={active.id} run={active} job={activeJob} jobRuns={jobRuns} onSelectRun={setSelected} modes={modes.data ? Object.keys(modes.data) : null} onStop={cancel} onRerun={r => void rerun(r)} onDelete={async r => { await remove([r.id]); setSelected(null) }} />
              : <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">Select a run to see its log.</div>}
          </div>
        )}

      <AlertDialog open={!!clear} onOpenChange={o => { if (!o) setClear(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {clear ? formatCount(clear.ids.length, 'run') : ''}?</AlertDialogTitle>
            <AlertDialogDescription>This removes {clear?.label} and their saved logs. It can’t be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => { if (clear) void remove(clear.ids); setClear(null) }}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

function Total({ label, value, tone }: { label: string; value: string; tone?: 'bad' }) {
  return (
    <div className="flex items-baseline gap-1.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <b className={`text-sm tabular-nums ${tone === 'bad' ? 'text-[var(--bad)]' : ''}`}>{value}</b>
    </div>
  )
}
