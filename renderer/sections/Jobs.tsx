import { useEffect, useMemo, useRef, useState } from 'react'
import { LayoutGrid, Radar } from 'lucide-react'

import { EmptyNote } from '../components/EmptyState'
import { BulkBar, useEvaluateJobs } from '../components/jobs/BulkBar'
import { applyJobFilters, loadPersistedFilters, persistFilters, toApplication, type JobFilters, type ScreenedJob } from '../components/jobs/filters'
import { JobsTable } from '../components/jobs/JobsTable'
import { JobsToolbar, type JobsView } from '../components/jobs/JobsToolbar'
import { PrescreenControls, usePrescreen } from '../components/jobs/prescreen'
import { EmptyState } from '../components/kit/EmptyState'
import { Panel } from '../components/Panel'
import { PipelineBoard } from '../components/pipeline/PipelineBoard'
import { SectionSkeleton } from '../components/Skeleton'
import { usePolled } from '../hooks/usePolled'
import { useRuns } from '../hooks/useRuns'
import { careerloom } from '../lib/ipc'
import { loadJobsUi, openJob, saveJobsUi, setJobList } from '../lib/jobNav'
import { navigate } from '../lib/nav'
import type { JobState } from '../lib/types'

type Shortcut = { label: string; count: number; active: boolean; apply: JobFilters }

/** Jobs: every posting career-ops found (scan-history), queued (pipeline.md) or evaluated (tracker),
 *  browsable by portal with Jira-style filters; replaces the old Pipeline and Inbox screens. */
export function Jobs() {
  const { generation } = useRuns()
  const jobs = usePolled(() => careerloom.listJobs(), [generation], { intervalMs: 20_000 })
  const portals = usePolled(() => careerloom.listPortals(), [generation], { intervalMs: 20_000 })
  const [filters, setFiltersState] = useState<JobFilters>(() => loadPersistedFilters())
  const [view, setView] = useState<JobsView>('table')
  const [selected, setSelected] = useState<string[]>(() => loadJobsUi().selected)
  const rootRef = useRef<HTMLDivElement>(null)
  const open = (j: ScreenedJob) => openJob(j.id)
  const prescreen = usePrescreen(generation)
  const evaluateJobs = useEvaluateJobs()
  const selectedRef = useRef(selected)
  selectedRef.current = selected
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
  useEffect(() => setJobList(shown.map(j => j.id)), [shown])
  // Back from a job page: selection and table scroll come back as they were.
  const scroller = () => rootRef.current?.querySelector<HTMLElement>('.fill-scroll') ?? null
  useEffect(() => { const el = scroller(); if (el) el.scrollTop = loadJobsUi().scroll }, [jobs.data === undefined]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => () => saveJobsUi({ selected: selectedRef.current, scroll: scroller()?.scrollTop ?? 0 }), []) // eslint-disable-line react-hooks/exhaustive-deps
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
    return (
      <Panel title="Jobs" className="workspace">
        {portalList.length === 0
          ? <EmptyState icon={LayoutGrid} title="No boards yet" message="Add a job board — a Greenhouse/Ashby/Lever link, any listing page, or the defaults — then scan it." action="Go to Boards" onAction={() => navigate('boards')} hideActionIcon />
          : <EmptyState icon={Radar} title="No jobs found yet" message={`Scan your ${portalList.length} board${portalList.length === 1 ? '' : 's'} to list open roles.`} action="Go to Boards" onAction={() => navigate('boards')} hideActionIcon />}
      </Panel>
    )
  }

  const boardApps = shown.flatMap(j => { const a = toApplication(j, portalList); return a ? [a] : [] })

  return (
    <div ref={rootRef} className="workspace workspace-fill flex flex-col gap-3">
      <div className="flex shrink-0 flex-wrap gap-2" role="group" aria-label="Jobs by state">
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
      <div className="shrink-0">
        <JobsToolbar jobs={all} portals={portalList} filters={filters} onFiltersChange={setFilters} view={view} onViewChange={setView} searchInputRef={searchRef} />
      </div>
      {selectedJobs.length > 0 && <div className="shrink-0"><BulkBar jobs={selectedJobs} onClear={() => setSelected([])} onChanged={refresh} /></div>}
      {view === 'table'
        ? <JobsTable jobs={shown} portals={portalList} onOpen={open} selected={selected} onSelectedChange={setSelected} onScreened={prescreen.refresh} />
        : boardApps.length
          ? <div className="min-h-0 flex-1 overflow-auto"><PipelineBoard apps={boardApps} onOpen={a => { const j = shown.find(x => x.reportNum === a.num); if (j) open(j) }} onStatusChanged={refresh} /></div>
          : <EmptyNote>No evaluated jobs match these filters. The board shows evaluated jobs; switch to Table for the rest.</EmptyNote>}
    </div>
  )
}
