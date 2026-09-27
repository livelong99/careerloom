import { useMemo, useState, type RefObject } from 'react'
import { CalendarRange, Link2, Save, Trash2 } from 'lucide-react'

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Slider } from '@/components/ui/slider'
import { Textarea } from '@/components/ui/textarea'

import { useRuns } from '../../hooks/useRuns'
import type { JobState, Portal } from '../../lib/types'
import { Dropdown, type DropdownOption } from '../Dropdown'
import { FilterBar } from '../kit/FilterBar'
import { SearchFilterMenu } from '../kit/SearchFilterMenu'
import { SegTabs } from '../SegTabs'
import { RangeCalendar } from '../pipeline/RangeCalendar'
import {
  activeFilterChips, DEFAULT_FILTERS, facetCounts, loadSavedViews, NO_PORTAL, removeFilterChip,
  saveSavedViews, SCREENS, STATES, toggle, type JobFilters, type SavedView, type ScreenedJob, type ScreenKey,
} from './filters'

export type JobsView = 'table' | 'board'
const MAX_VIEW_NAME = 40

type Props = {
  jobs: ScreenedJob[]
  portals: Portal[]
  filters: JobFilters
  onFiltersChange: (f: JobFilters) => void
  view: JobsView
  onViewChange: (v: JobsView) => void
  searchInputRef?: RefObject<HTMLInputElement | null>
}

const byCount = (counts: Map<string, number>, label: (v: string) => string = v => v) =>
  [...counts.keys()].sort((a, b) => (counts.get(b) ?? 0) - (counts.get(a) ?? 0) || a.localeCompare(b)).map(value => ({ value, label: label(value), count: counts.get(value) }))

/** Search, Jira-style facets, saved views, "Evaluate a link" and the Table/Board switch. */
export function JobsToolbar({ jobs, portals, filters, onFiltersChange, view, onViewChange, searchInputRef }: Props) {
  const [savedViews, setSavedViews] = useState<SavedView[]>(() => loadSavedViews())
  const [saveOpen, setSaveOpen] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const set = (patch: Partial<JobFilters>) => onFiltersChange({ ...filters, ...patch })

  const facets = useMemo(() => {
    const portalName = (id: string) => (id === NO_PORTAL ? 'Pasted links' : portals.find(p => p.id === id)?.name ?? id)
    const states = facetCounts(jobs, filters, 'states')
    const screens = facetCounts(jobs, filters, 'screen')
    return {
      portals: byCount(facetCounts(jobs, filters, 'portals'), portalName),
      companies: byCount(facetCounts(jobs, filters, 'companies')),
      states: STATES.map(s => ({ value: s.id, label: s.label, count: states.get(s.id) ?? 0 })),
      locations: byCount(facetCounts(jobs, filters, 'locations')),
      trustFlags: byCount(facetCounts(jobs, filters, 'trustFlags')),
      screen: SCREENS.map(s => ({ value: s.id, label: s.label, count: screens.get(s.id) ?? 0 })),
    }
  }, [jobs, portals, filters])

  const menu = (label: string, key: 'portals' | 'companies' | 'locations' | 'trustFlags', searchable = true) => (
    <SearchFilterMenu
      label={label} multi searchable={searchable} options={facets[key]} selected={filters[key]}
      onToggle={v => set({ [key]: toggle(filters[key], v) })}
      onClear={() => set({ [key]: [] })}
    />
  )

  const viewOptions: DropdownOption[] = [{ value: 'all', label: 'All jobs' }, ...savedViews.map(v => ({ value: v.id, label: v.name }))]
  const activeSaved = savedViews.find(v => JSON.stringify(v.filters) === JSON.stringify(filters)) ?? null

  const confirmSave = () => {
    const name = nameDraft.trim().slice(0, MAX_VIEW_NAME)
    if (!name) return
    // Same name replaces rather than duplicating — no separate overwrite confirm.
    const next = [...savedViews.filter(v => v.name !== name), { id: crypto.randomUUID(), name, filters }]
    setSavedViews(next)
    saveSavedViews(next)
    setSaveOpen(false)
  }

  const deleteActive = () => {
    if (!activeSaved) return
    const next = savedViews.filter(v => v.id !== activeSaved.id)
    setSavedViews(next)
    saveSavedViews(next)
    onFiltersChange(DEFAULT_FILTERS)
  }

  const chips = activeFilterChips(filters, portals)
  const fitLabel = filters.scoreMin > 0 || filters.scoreMax < 5 ? `Fit ${filters.scoreMin.toFixed(1)}–${filters.scoreMax.toFixed(1)}` : 'Fit'
  const postedLabel = filters.postedFrom || filters.postedTo ? `${filters.postedFrom ?? '…'} → ${filters.postedTo ?? '…'}` : 'Posted'

  return (
    <div className="pipeline-toolbar space-y-2">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="row-actions min-w-0 flex-1" role="group" aria-label="Filters">
        <Input
          ref={searchInputRef} type="search" placeholder="Search title, company, location (/)"
          value={filters.query} onChange={e => set({ query: e.target.value })}
          aria-label="Search jobs" className="h-8 w-64 shrink-0"
        />
        {menu('Portal', 'portals')}
        {menu('Company', 'companies')}
        <SearchFilterMenu
          label="State" multi options={facets.states} selected={filters.states}
          onToggle={v => set({ states: toggle(filters.states, v as JobState) })}
          onClear={() => set({ states: [] })}
        />
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs font-normal">{fitLabel}</Button>
          </PopoverTrigger>
          <PopoverContent className="w-56 space-y-3">
            <div className="text-xs font-medium text-muted-foreground">Fit score</div>
            <Slider min={0} max={5} step={0.1} value={[filters.scoreMin, filters.scoreMax]} onValueChange={v => set({ scoreMin: v[0] ?? 0, scoreMax: v[1] ?? 5 })} />
            <div className="flex justify-between text-xs tabular-nums text-muted-foreground"><span>{filters.scoreMin.toFixed(1)}</span><span>{filters.scoreMax.toFixed(1)}</span></div>
          </PopoverContent>
        </Popover>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 gap-1 text-xs font-normal"><CalendarRange className="h-3.5 w-3.5" />{postedLabel}</Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-3">
            <RangeCalendar
              value={filters.postedFrom && filters.postedTo ? { from: filters.postedFrom, to: filters.postedTo } : null}
              onSelect={r => set({ postedFrom: r.from, postedTo: r.to })}
            />
          </PopoverContent>
        </Popover>
        {menu('Location', 'locations')}
        {facets.trustFlags.length > 0 && menu('Trust', 'trustFlags', false)}
        <Button
          variant={filters.staleOnly ? 'default' : 'outline'} size="sm" className="h-8 text-xs font-normal"
          aria-pressed={filters.staleOnly} onClick={() => set({ staleOnly: !filters.staleOnly })}
          title="Evaluated before your résumé last changed"
        >
          Stale only
        </Button>
        <SearchFilterMenu
          label="Pre-screen" multi searchable={false} options={facets.screen} selected={filters.screen}
          onToggle={v => set({ screen: toggle(filters.screen, v as ScreenKey) })}
          onClear={() => set({ screen: [] })}
        />
        <Button
          variant={filters.hideUnlikely ? 'default' : 'outline'} size="sm" className="h-8 text-xs font-normal"
          aria-pressed={filters.hideUnlikely} onClick={() => set({ hideUnlikely: !filters.hideUnlikely })}
          title="Hide jobs the pre-screen marked unlikely (they stay evaluable)"
        >
          Hide unlikely
        </Button>
      </div>
      <div className="row-actions ml-auto" role="group" aria-label="Views">
        <EvaluateLinkButton />
        <Dropdown id="jobs-view-select" ariaLabel="Saved view" value={activeSaved?.id ?? 'all'} options={viewOptions}
          onChange={v => onFiltersChange(savedViews.find(s => s.id === v)?.filters ?? DEFAULT_FILTERS)} />
        <Button variant="ghost" size="sm" className="h-8 gap-1 text-xs" onClick={() => { setNameDraft(activeSaved?.name ?? ''); setSaveOpen(true) }}>
          <Save className="h-3.5 w-3.5" /> Save view
        </Button>
        {activeSaved && (
          <Button variant="ghost" size="sm" className="h-8 text-xs" onClick={() => setConfirmDelete(true)} aria-label={`Delete view "${activeSaved.name}"`} title="Delete this view">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        )}
        <SegTabs options={[{ value: 'table', label: 'Table' }, { value: 'board', label: 'Board' }]} value={view} onChange={v => onViewChange(v as JobsView)} />
      </div>
      </div>
      {chips.length > 0 && <FilterBar filters={chips} onRemove={key => onFiltersChange(removeFilterChip(filters, key))} onClear={() => onFiltersChange(DEFAULT_FILTERS)} />}
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete the “{activeSaved?.name}” view?</AlertDialogTitle>
            <AlertDialogDescription>Only the saved filters are removed; no jobs are affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep it</AlertDialogCancel>
            <AlertDialogAction onClick={deleteActive}>Delete view</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Dialog open={saveOpen} onOpenChange={setSaveOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader><DialogTitle>Save current filters as a view</DialogTitle></DialogHeader>
          <Input autoFocus value={nameDraft} maxLength={MAX_VIEW_NAME} placeholder="View name"
            onChange={e => setNameDraft(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') confirmSave() }} />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setSaveOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={confirmSave} disabled={!nameDraft.trim()}>Save view</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

/** Replaces the old Inbox: paste a posting URL or a whole JD and evaluate it now. */
function EvaluateLinkButton() {
  const { evaluate } = useRuns()
  const [open, setOpen] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const submit = async () => {
    if (!text.trim() || busy) return
    setBusy(true)
    try { if (await evaluate(text.trim())) { setText(''); setOpen(false) } } finally { setBusy(false) }
  }
  return (
    <>
      <Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => setOpen(true)}><Link2 className="h-3.5 w-3.5" /> Evaluate a link</Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Evaluate a job</DialogTitle>
            <DialogDescription>Paste a posting URL or the full job description. The report lands in this list when it finishes.</DialogDescription>
          </DialogHeader>
          <Textarea autoFocus rows={6} value={text} maxLength={18_000} placeholder="https://… or the job description"
            onChange={e => setText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) void submit() }} />
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            <Button size="sm" onClick={() => void submit()} disabled={!text.trim() || busy}>{busy ? 'Starting…' : 'Evaluate'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
