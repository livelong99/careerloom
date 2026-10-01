import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { Skeleton } from '@/components/ui/skeleton'

import type { KbItemDetail, KbItemView, ResearchEstimate, ResearchOptions } from '../../../electron/kb/types'
import { careerloom, normalizeCliError } from '../../lib/ipc'
import { goToSettings, openRuns } from '../../lib/nav'
import { showToast } from '../../lib/toast'
import { kb, useOnline } from '../kb/api'
import { Banners } from '../kb/Banners'
import { BankFilters } from '../kb/BankFilters'
import { BankTable } from '../kb/BankTable'
import { CoverageRail } from '../kb/CoverageRail'
import { EmptyStates } from '../kb/EmptyStates'
import { applyFilter, isFiltered, NO_FILTER, type BankFilter, type SortKey, sortItems } from '../kb/filter'
import { type ItemDraft, ItemDialog } from '../kb/ItemDialog'
import { ItemSheet } from '../kb/ItemSheet'
import { practiseKb } from '../kb/practice'
import { ResearchRun } from '../kb/ResearchRun'
import { StatusStrip } from '../kb/StatusStrip'
import { useKb } from '../kb/useKb'
import { useEscape } from '../../hooks/useEscape'
import { Button } from '@/components/ui/button'
import { ConsentDialog } from '../kb/ConsentDialog'
import { KB_CONSENT } from '../kb/consentCopy'
import { useInterviewConfig } from '../kb/useConfig'

const note = (m: string): void => showToast(m, 'error', 6000)

/** Job › Knowledge base: status, coverage, filterable question bank, detail sheet, live research run (design §3.1). */
export function KnowledgeTab({ jobId, jobTitle = 'this job' }: { jobId: string; jobTitle?: string }) {
  const { summary, items, progress, loading, error, unavailable, reload } = useKb(jobId)
  const offline = !useOnline()
  const [filter, setFilter] = useState<BankFilter>(NO_FILTER)
  const [showHidden, setShowHidden] = useState(false)
  const [sort, setSort] = useState<{ key: SortKey; dir: 1 | -1 }>({ key: 'default', dir: 1 })
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [detail, setDetail] = useState<KbItemDetail | null>(null)
  const [dialog, setDialog] = useState<'add' | 'edit' | null>(null)
  const [estimate, setEstimate] = useState<ResearchEstimate | null>(null)
  const { consented, opts: DEFAULTS, backend, agree } = useInterviewConfig()
  const [budget, setBudget] = useState(DEFAULTS.budgetUsd)
  const [consentOpen, setConsentOpen] = useState(false)
  const pending = useRef<Partial<ResearchOptions> | null>(null)

  const status = summary?.status ?? 'none'
  useEffect(() => { // the cost/time hint and the "needs a key" fork for the empty states
    if (status === 'none') kb().kbEstimate(jobId, DEFAULTS).then(setEstimate, () => setEstimate(null))
  }, [jobId, status, DEFAULTS.depth, DEFAULTS.budgetUsd, DEFAULTS.minutes]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setSelectedId(null); setFilter(NO_FILTER) }, [jobId])
  useEffect(() => {
    if (!selectedId) { setDetail(null); return }
    let live = true
    kb().kbItem(jobId, selectedId).then(d => { if (live) setDetail(d) }, e => { if (live) { setSelectedId(null); note(normalizeCliError(e).message) } })
    return () => { live = false }
  }, [jobId, selectedId, items])
  useEscape(selectedId !== null && dialog === null, () => setSelectedId(null))

  const names = useMemo(() => new Map((summary?.coverage ?? []).map(c => [c.skillId, c.name])), [summary])
  const skillName = useCallback((id: string) => names.get(id) ?? id, [names])
  const shown = useMemo(() => sortItems(applyFilter(items, filter, showHidden), sort.key, sort.dir), [items, filter, showHidden, sort])
  const hiddenCount = items.filter(i => i.user.hidden).length

  const start = async (over: Partial<ResearchOptions>): Promise<void> => {
    const opts = { ...DEFAULTS, ...over }
    try { setBudget(opts.budgetUsd); await kb().kbResearchStart(jobId, opts); await reload() } catch (e) { note(normalizeCliError(e).message) }
  }
  const run = async (over: Partial<ResearchOptions> = {}): Promise<void> => {
    if (!consented) { pending.current = over; setConsentOpen(true); return } // first run: acknowledge web research before anything is sent
    await start(over)
  }
  const update = async (id: string, patch: Parameters<ReturnType<typeof kb>['kbItemUpdate']>[2]): Promise<void> => {
    try { await kb().kbItemUpdate(jobId, id, patch) } catch (e) { note(normalizeCliError(e).message) }
  }
  const save = async (d: ItemDraft): Promise<void> => {
    try {
      if (dialog === 'edit' && selectedId) await kb().kbItemUpdate(jobId, selectedId, d)
      else { const v = await kb().kbItemAdd(jobId, d); setSelectedId(v.id) }
    } catch (e) { note(normalizeCliError(e).message); throw e }
  }
  const exportBank = (): void => void kb().kbExport(jobId).then(
    p => showToast('Question base exported', 'ok', 8000, { label: 'Show in folder', onClick: () => void careerloom.revealPath(p) }), e => note(normalizeCliError(e).message))
  const remove = async (id: string): Promise<void> => {
    try { await kb().kbItemRemove(jobId, id); setSelectedId(null) } catch (e) { note(normalizeCliError(e).message) }
  }
  const sortBy = (key: SortKey): void => setSort(s => (s.key === key ? { key, dir: s.dir === 1 ? -1 : 1 } : { key, dir: 1 }))

  if (loading) return <div className="p-4" role="status" aria-label="Loading knowledge base"><Skeleton className="mb-3 h-14 w-full" /><Skeleton className="h-64 w-full" /></div>
  if (error) return <div className="p-4 text-sm" role="alert">{error} <button type="button" className="cursor-pointer border-0 bg-transparent font-medium text-brand-text hover:underline" onClick={() => void reload()}>Try again</button></div>
  if (unavailable || !summary) return <div className="p-4 text-sm text-muted-foreground">The question base isn’t available in this build yet.</div>

  const running = summary.status === 'running'
  const empty = items.length === 0 && !running
  const sheetOpen = selectedId !== null && detail !== null
  const open = (id: string): void => setSelectedId(id)
  return (
    <div className={`grid gap-0 p-4 ${sheetOpen ? 'lg:grid-cols-[minmax(0,1fr)_410px]' : ''}`} data-job-id={jobId}>
      <div className={`min-w-0 ${sheetOpen ? 'lg:pr-4' : ''}`}>
        {!consented && !running && (
          <div role="status" className="mb-2.5 flex flex-wrap items-center gap-2.5 rounded-lg border border-border bg-card px-3 py-2.5 text-[13px]">
            <span className="flex-1">{KB_CONSENT.notice}</span><Button size="sm" onClick={() => setConsentOpen(true)}>{KB_CONSENT.review}</Button>
          </div>
        )}
        {running && <ResearchRun jobTitle={jobTitle} progress={progress && (!summary.runId || progress.runId === summary.runId) ? progress : null} budgetUsd={budget} onStop={() => summary.runId && void kb().kbResearchStop(summary.runId).then(reload)} onOpenRun={() => openRuns(summary.runId ?? undefined)} />}
        {empty && <EmptyStates locked={!consented} estimate={estimate} onResearch={() => void run()} onAdd={() => setDialog('add')} onKeys={() => goToSettings('keys', 'key:brave')} onNoSearch={() => void run({ noSearch: true })} />}
        {!empty && (
          <>
            {!running && <Banners summary={summary} offline={offline} onRefresh={() => void run()} onContinue={() => void run({ budgetUsd: 0.1 })} />}
            {!running && <StatusStrip summary={summary} offline={offline} locked={!consented} hasItems={items.length > 0} onRefresh={() => void run()} onAdd={() => setDialog('add')} onPractise={() => practiseKb(jobId)} onExport={exportBank} onOpenRun={() => openRuns(summary.runId ?? undefined)} />}
            <CoverageRail coverage={summary.coverage} active={filter.skill} onPick={skill => setFilter(f => ({ ...f, skill }))} />
            <BankFilters value={filter} onChange={setFilter} items={items} coverage={summary.coverage} hiddenCount={hiddenCount} showHidden={showHidden} onShowHidden={setShowHidden} />
            {shown.length > 0
              ? <BankTable items={shown} skillName={skillName} selectedId={selectedId} onOpen={open} sort={sort} onSort={sortBy} />
              : <p className="m-0 rounded-lg border border-dashed border-border p-6 text-center text-sm text-muted-foreground">{isFiltered(filter) ? 'No questions match these filters.' : 'Nothing to show yet.'}</p>}
          </>
        )}
      </div>
      {sheetOpen && detail && (
        <ItemSheet item={detail} onClose={() => setSelectedId(null)} onPin={() => void update(detail.id, { pinned: !detail.user.pinned })} onHide={() => void update(detail.id, { hidden: !detail.user.hidden })}
          onEdit={() => setDialog('edit')} onPractise={() => practiseKb(jobId, [detail.id])} onRemove={() => void remove(detail.id)} onOpenSource={id => void kb().kbOpenSource(id).then(ok => { if (!ok) note('That link can’t be opened') })} />
      )}
      <ConsentDialog open={consentOpen} onOpenChange={setConsentOpen} backend={backend} onAgree={async v => {
        try { await agree(v) } catch (e) { note(normalizeCliError(e).message); throw e }
        const over = pending.current; pending.current = null
        if (over) void start(over)
      }} />
      {dialog && <ItemDialog key={dialog + (selectedId ?? '')} open onOpenChange={o => { if (!o) setDialog(null) }} coverage={summary.coverage} onSave={save}
        initial={dialog === 'edit' && detail ? { text: detail.text, type: detail.type, skills: detail.skills, difficulty: detail.difficulty } : undefined} />}
    </div>
  )
}
