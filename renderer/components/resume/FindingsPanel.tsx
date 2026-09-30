import { useEffect, useMemo, useState } from 'react'

import { careerloom, normalizeCliError } from '../../lib/ipc'
import { showToast } from '../../lib/toast'
import type { AtsAnswer, AtsHistoryItem, AtsReport } from '../../lib/types'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '../ui/alert-dialog'
import { Button } from '../ui/button'
import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '../ui/empty'
import { ToggleGroup, ToggleGroupItem } from '../ui/toggle-group'
import { FindingRow, type PreviewState } from './FindingRow'

type Filter = 'open' | 'applied' | 'dismissed'
const msg = (e: unknown) => normalizeCliError(e).message

/** Turn a preview failure into a row state: "Answer first: a, b" asks for answers, anything else is an error. */
const fromError = (e: unknown): PreviewState => {
  const m = msg(e)
  const hit = /^Answer first: (.+)$/.exec(m)
  return hit ? { state: 'needs', unmet: hit[1]!.split(', ') } : { state: 'error', message: m }
}

export function FindingsPanel({ report, history, categories, onChanged, onGoContent }: {
  report: AtsReport
  history: AtsHistoryItem[]
  /** limit to these categories (Skill-up shows only skills) */
  categories?: AtsReport['findings'][number]['category'][]
  onChanged: () => void
  onGoContent: () => void
}) {
  const [filter, setFilter] = useState<Filter>('open')
  const [previews, setPreviews] = useState<Record<string, PreviewState>>({})
  const [busy, setBusy] = useState(false)
  const [confirmAll, setConfirmAll] = useState(false)
  const all = useMemo(() => report.findings.filter(f => !categories || categories.includes(f.category)), [report, categories])
  const shown = all.filter(f => f.status === filter)
  const hash = report.hashes.cv + report.id

  // Preview every open change once per résumé version, so "Apply all safe" knows which are safe.
  useEffect(() => {
    let live = true
    const todo = all.filter(f => f.status === 'open' && f.apply)
    setPreviews(Object.fromEntries(todo.map(f => [f.id, { state: 'loading' } as PreviewState])))
    void (async () => {
      for (const f of todo) {
        const next = await careerloom.atsPreviewApply(f.id).then((preview): PreviewState => ({ state: 'ok', preview }), fromError)
        if (!live) return
        setPreviews(p => ({ ...p, [f.id]: next }))
      }
    })()
    return () => { live = false }
  }, [hash]) // eslint-disable-line react-hooks/exhaustive-deps

  const preview = (id: string) => async (answers: AtsAnswer[]) => {
    setPreviews(p => ({ ...p, [id]: { state: 'loading' } }))
    const next = await careerloom.atsPreviewApply(id, answers).then((pv): PreviewState => ({ state: 'ok', preview: pv }), fromError)
    setPreviews(p => ({ ...p, [id]: next }))
  }

  const apply = (id: string) => async (answers: AtsAnswer[], override: boolean): Promise<string | null> => {
    setBusy(true)
    try {
      const res = await careerloom.atsApply(id, override ? [...answers, { id: '_override', value: 1 }] : answers)
      if (!res.ok) return res.error ?? 'Could not apply this change'
      const before = report.match?.score
      const after = res.rescore?.match?.score
      showToast(before !== undefined && after !== undefined && before !== after ? `Applied. Job match ${before} → ${after}` : 'Applied')
      onChanged()
      return null
    } catch (e) { return msg(e) } finally { setBusy(false) }
  }

  const undo = async (undoId: string): Promise<string | null> => {
    setBusy(true)
    try {
      const res = await careerloom.atsUndo(undoId)
      if (!res.ok) return res.error ?? 'Could not undo'
      showToast('Change undone')
      onChanged()
      return null
    } catch (e) { return msg(e) } finally { setBusy(false) }
  }

  const skip = (id: string) => async () => { setBusy(true); try { await careerloom.atsDismiss(id); onChanged() } finally { setBusy(false) } }

  const safe = all.filter(f => f.status === 'open' && f.apply && previews[f.id]?.state === 'ok' && (previews[f.id] as { preview: { factCheck: { ok: boolean } } }).preview.factCheck.ok)
  const applyAllSafe = async () => {
    setConfirmAll(false)
    setBusy(true)
    let done = 0
    const failures: string[] = []
    for (const f of safe) {
      const res = await careerloom.atsApply(f.id).catch(e => ({ ok: false as const, error: msg(e) }))
      if (res.ok) done++; else failures.push(`${f.title}: ${res.error}`)
    }
    setBusy(false)
    showToast(failures.length ? `Applied ${done} of ${safe.length}. ${failures[0]}` : `Applied ${done} change${done === 1 ? '' : 's'}`, failures.length ? 'error' : 'ok', failures.length ? 6000 : undefined)
    onChanged()
  }

  const count = (s: Filter) => all.filter(f => f.status === s).length

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <ToggleGroup type="single" size="sm" value={filter} onValueChange={v => v && setFilter(v as Filter)} aria-label="Show findings">
          <ToggleGroupItem value="open">Open ({count('open')})</ToggleGroupItem>
          <ToggleGroupItem value="applied">Applied ({count('applied')})</ToggleGroupItem>
          <ToggleGroupItem value="dismissed">Skipped ({count('dismissed')})</ToggleGroupItem>
        </ToggleGroup>
        <div className="flex-1" />
        {filter === 'open' && safe.length > 0 && (
          <Button size="sm" variant="outline" className="border-border" disabled={busy} onClick={() => setConfirmAll(true)} title="Only changes with no unanswered questions and a passed fact check">
            Apply all safe ({safe.length})
          </Button>
        )}
      </div>
      {shown.length === 0 ? (
        <Empty className="border border-border">
          <EmptyHeader>
            <EmptyTitle>{filter === 'open' ? 'Nothing left to fix here' : filter === 'applied' ? 'Nothing applied yet' : 'Nothing skipped'}</EmptyTitle>
            <EmptyDescription>{filter === 'open' ? 'Run the analysis again after editing to check for new findings.' : 'Changes you apply appear here, and you can undo them.'}</EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : (
        <ul className="m-0 flex list-none flex-col gap-3 p-0">
          {shown.map(f => (
            <li key={f.id}>
              <FindingRow
                f={f} preview={previews[f.id]} questions={[...(report.questions ?? []), ...(report.session?.questions ?? [])]} busy={busy}
                undoId={history.find(h => h.findingId === f.id)?.undoId ?? null}
                onPreview={a => void preview(f.id)(a)} onApply={apply(f.id)} onSkip={() => void skip(f.id)()} onUndo={undo} onGoContent={onGoContent}
              />
            </li>
          ))}
        </ul>
      )}
      <AlertDialog open={confirmAll} onOpenChange={setConfirmAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apply {safe.length} safe change{safe.length === 1 ? '' : 's'}?</AlertDialogTitle>
            <AlertDialogDescription>Each one passed the fact check and needs no answers. You can undo them one by one from the Applied list.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void applyAllSafe()}>Apply</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
