import { useState } from 'react'

import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import { useRuns } from '../../hooks/useRuns'
import { careerloom, normalizeCliError } from '../../lib/ipc'
import { showToast } from '../../lib/toast'
import type { CanonicalStatus } from '../../lib/types'
import { openRuns } from '../RunsDrawer'
import { CANONICAL_STATUSES, type ScreenedJob } from './filters'
import { useUnlikelyGuard } from './prescreen'

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`

/** Evaluate exactly these jobs (one headless career-ops worker each); shared by the bulk bar and the job sheet. */
export function useEvaluateJobs() {
  const { adopt } = useRuns()
  return async (ids: string[], force = false) => {
    try {
      const run = await careerloom.evaluateJobs(ids, force)
      adopt(run)
      showToast(`${force ? 'Re-evaluating' : 'Evaluating'} ${plural(ids.length, 'job')} — follow it in Runs`)
      openRuns()
      return true
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error', 6000)
      return false
    }
  }
}

export function BulkBar({ jobs, onClear, onChanged }: { jobs: ScreenedJob[]; onClear: () => void; onChanged: () => void }) {
  const { start } = useRuns()
  const evaluateJobs = useEvaluateJobs()
  const [statusOpen, setStatusOpen] = useState(false)
  const [busy, setBusy] = useState(false)
  const { guard, dialog } = useUnlikelyGuard(ids => evaluateJobs(ids), onClear)

  const fresh = jobs.filter(j => (j.state === 'new' || j.state === 'queued') && j.url)
  const evaluated = jobs.filter(j => j.reportNum !== null)
  const reEval = evaluated.filter(j => j.url.startsWith('http'))
  const nums = evaluated.map(j => j.reportNum!)

  const run = async (fn: () => Promise<boolean | void>) => {
    setBusy(true)
    try { if ((await fn()) !== false) onClear() } finally { setBusy(false) }
  }

  const setStatus = (status: CanonicalStatus) => run(async () => {
    setStatusOpen(false)
    try {
      const result = await careerloom.setStatus(nums, status)
      if (result.failed.length) showToast(`${result.updated.length} updated, ${result.failed.length} failed: ${result.failed[0]!.error}`, 'error', 6000)
      else showToast(`Moved ${plural(result.updated.length, 'job')} to ${status}`)
      onChanged()
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error', 6000)
      return false
    }
  })

  return (
    <div className="row-actions sticky top-0 z-10 flex-wrap rounded-md border border-(--accent) bg-(--card-inner) px-3 py-2 shadow-sm" role="toolbar" aria-label="Selected jobs">
      <span className="text-sm font-medium tabular-nums">{jobs.length} selected</span>
      {fresh.length > 0 && <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={() => void run(() => guard(fresh))}>{busy ? 'Starting…' : `Evaluate ${plural(fresh.length, 'job')}`}</Button>}
      {reEval.length > 0 && <Button size="sm" variant="secondary" className="h-8 text-xs" disabled={busy} onClick={() => void run(() => evaluateJobs(reEval.map(j => j.id), true))}>Re-evaluate {plural(reEval.length, 'job')}</Button>}
      {nums.length > 0 && (
        <Popover open={statusOpen} onOpenChange={setStatusOpen}>
          <PopoverTrigger asChild>
            <Button size="sm" variant="secondary" className="h-8 text-xs" disabled={busy}>Set status of {nums.length}…</Button>
          </PopoverTrigger>
          <PopoverContent className="w-40 p-1" align="start">
            {CANONICAL_STATUSES.map(s => (
              <button key={s} type="button" className="flex w-full cursor-pointer rounded-(--rad-4) px-2 py-1.5 text-left text-sm hover:bg-accent focus-visible:bg-accent focus-visible:outline-2 focus-visible:outline-(--accent-text)" onClick={() => void setStatus(s)}>{s}</button>
            ))}
          </PopoverContent>
        </Popover>
      )}
      {nums.length > 0 && nums.length <= 5 && (
        <>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => nums.forEach(n => void start('pdf', String(n)))}>Tailor CV</Button>
          <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => nums.forEach(n => void start('apply', String(n)))}>Draft answers</Button>
        </>
      )}
      <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onClear}>Clear selection</Button>
      {dialog}
    </div>
  )
}
