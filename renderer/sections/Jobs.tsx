import { useEffect, useMemo, useRef, useState } from 'react'
import { Briefcase, Radar } from 'lucide-react'

import { EmptyNote } from '../components/EmptyState'
import { BulkBar, useEvaluateJobs } from '../components/jobs/BulkBar'
import { applyJobFilters, loadPersistedFilters, NO_PORTAL, persistFilters, toApplication, type JobFilters, type ScreenedJob } from '../components/jobs/filters'
import { JobSheet } from '../components/jobs/JobSheet'
import { JobsTable } from '../components/jobs/JobsTable'
import { JobsToolbar, type JobsView } from '../components/jobs/JobsToolbar'
import { AddWebBoardDialog } from '../components/jobs/AddWebBoardDialog'
import { PortalRail } from '../components/jobs/PortalRail'
import { PrescreenControls, usePrescreen } from '../components/jobs/prescreen'
import { EmptyState } from '../components/kit/EmptyState'
import { Panel } from '../components/Panel'
import { PipelineBoard } from '../components/pipeline/PipelineBoard'
import { ReportDrawer } from '../components/ReportDrawer'
import { openRuns } from '../components/RunsDrawer'
import { SectionSkeleton } from '../components/Skeleton'
import { usePolled } from '../hooks/usePolled'
import { useRuns } from '../hooks/useRuns'
import { careerloom, normalizeCliError } from '../lib/ipc'
import { showToast } from '../lib/toast'
import type { JobState } from '../lib/types'

type Shortcut = { label: string; count: number; active: boolean; apply: JobFilters }

/** Jobs: every posting career-ops found (scan-history), queued (pipeline.md) or evaluated (tracker),
 *  browsable by portal with Jira-style filters; replaces the old Pipeline and Inbox screens. */
export function Jobs() {
  const { generation, adopt } = useRuns()
  const jobs = usePolled(() => careerloom.listJobs(), [generation], { intervalMs: 20_000 })
  const portals = usePolled(() => careerloom.listPortals(), [generation], { intervalMs: 20_000 })
  const [filters, setFiltersState] = useState<JobFilters>(() => loadPersistedFilters())
  const [view, setView] = useState<JobsView>('table')
  const [selected, setSelected] = useState<string[]>([])
  const [open, setOpen] = useState<ScreenedJob | null>(null)
  const [addingBoard, setAddingBoard] = useState(false)
  const prescreen = usePrescreen(generation)
  const evaluateJobs = useEvaluateJobs()
  const searchRef = useRef<HTMLInputElement>(null)

  const setFilters = (f: JobFilters) => { setFiltersState(f); persistFilters(f) }
  const refresh = () => { jobs.refresh(); portals.refresh() }

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (e.key !== '/' || t?.closest('input, textarea, [contenteditable="true"]')) return
      e.preventDefault()
      searchRef.current?.focus()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const screens = prescreen.map
  const all = useMemo((): ScreenedJob[] => (jobs.data ?? []).map(j => (screens[j.id] ? { ...j, screen: screens[j.id] } : j)), [jobs.data, screens])
  const portalList = portals.data ?? []
  const shown = useMemo(() => applyJobFilters(all, filters), [all, filters])
  const selectedJobs = useMemo(() => all.filter(j => selected.includes(j.id)), [all, selected])

  const shortcuts = useMemo((): Shortcut[] => {
    const count = (states: JobState[]) => all.filter(j => states.includes(j.state)).length
    const stateShortcut = (label: string, states: JobState[]): Shortcut => ({
      label, count: count(states),
      active: !filters.staleOnly && filters.states.length === states.length && states.every(s => filters.states.includes(s)),
      apply: { ...filters, staleOnly: false, states },
    })
    return [
      stateShortcut('New', ['new']),
      stateShortcut('Queued', ['queued']),
      stateShortcut('Evaluated', ['evaluated']),
      { label: 'Stale', count: all.filter(j => j.stale).length, active: filters.staleOnly, apply: { ...filters, states: [], staleOnly: true } },
      stateShortcut('Applied', ['applied', 'interview', 'offer']),
    ]
  }, [all, filters])

  if (!jobs.data && !portals.data) {
    if (jobs.error ?? portals.error) return <Panel title="Jobs"><EmptyNote>{(jobs.error ?? portals.error)!.message}</EmptyNote></Panel>
    return <SectionSkeleton label="Jobs" rows={6} />
  }

  if (all.length === 0) {
    const scanAll = async () => {
      try { adopt(await careerloom.scanPortals([])); openRuns() } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) }
    }
    return (
      <Panel title="Jobs" className="workspace">
        {portalList.length === 0
          ? <EmptyState icon={Briefcase} title="No job portals yet" message="Add a job board — a Greenhouse/Ashby/Lever link or any listing page — then scan it here." action="Add a portal" onAction={() => setAddingBoard(true)} hideActionIcon />
          : <EmptyState icon={Radar} title="No jobs found yet" message={`Scan your ${portalList.length} portal${portalList.length === 1 ? '' : 's'} to list open roles.`} action="Scan portals" onAction={() => void scanAll()} hideActionIcon />}
        {addingBoard && <AddWebBoardDialog onClose={() => setAddingBoard(false)} onAdded={refresh} />}
      </Panel>
    )
  }

  const boardApps = shown.flatMap(j => { const a = toApplication(j, portalList); return a ? [a] : [] })
  const openApp = open && toApplication(open, portalList)

  return (
    <div className="workspace flex items-start gap-4">
      <PortalRail
        portals={portalList} total={all.length}
        selected={filters.portals.filter(p => p !== NO_PORTAL)}
        onSelectedChange={ids => setFilters({ ...filters, portals: ids })}
        onChanged={refresh}
      />
      <div className="min-w-0 flex-1 space-y-3">
        <div className="flex flex-wrap gap-2" role="group" aria-label="Jobs by state">
          {shortcuts.map(s => (
            <button
              key={s.label} type="button" aria-pressed={s.active}
              onClick={() => setFilters(s.active ? { ...filters, states: [], staleOnly: false } : s.apply)}
              className={`h-8 cursor-pointer rounded-md border px-3 text-left text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-(--accent-text) ${s.active ? 'border-(--accent) bg-(--hover)' : 'border-(--line) bg-(--panel) hover:bg-(--hover)'}`}
            >
              <span className="text-muted-foreground">{s.label}</span>{' '}
              <span className="font-semibold tabular-nums">{s.count}</span>
            </button>
          ))}
          {jobs.error && <span className="self-center text-xs text-muted-foreground">Showing the last loaded list — {jobs.error.message}</span>}
          <PrescreenControls jobs={all} selected={selectedJobs} prescreen={prescreen} onEvaluate={evaluateJobs} />
        </div>
        <JobsToolbar jobs={all} portals={portalList} filters={filters} onFiltersChange={setFilters} view={view} onViewChange={setView} searchInputRef={searchRef} />
        {selectedJobs.length > 0 && <BulkBar jobs={selectedJobs} onClear={() => setSelected([])} onChanged={refresh} />}
        {view === 'table'
          ? <JobsTable jobs={shown} portals={portalList} onOpen={setOpen} selected={selected} onSelectedChange={setSelected} onScreened={prescreen.refresh} />
          : boardApps.length
            ? <PipelineBoard apps={boardApps} onOpen={a => setOpen(shown.find(j => j.reportNum === a.num) ?? null)} onStatusChanged={refresh} />
            : <EmptyNote>No evaluated jobs match these filters. The board shows evaluated jobs; switch to Table for the rest.</EmptyNote>}
      </div>
      {open && (openApp
        ? <ReportDrawer app={openApp} onClose={() => setOpen(null)} />
        : <JobSheet job={open} portals={portalList} onClose={() => setOpen(null)} onScreened={prescreen.refresh} />)}
    </div>
  )
}
