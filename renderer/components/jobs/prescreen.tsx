import { useEffect, useRef, useState } from 'react'
import { Filter, Loader2, ThumbsDown, ThumbsUp } from 'lucide-react'

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'

import { usePolled } from '../../hooks/usePolled'
import { careerloom, normalizeCliError } from '../../lib/ipc'
import { showToast } from '../../lib/toast'
import type { PrescreenEntry, PrescreenPolicy, PrescreenRun, PrescreenStatus } from '../../lib/types'
import { SettingChip } from '../settings/SettingChip'
import type { ScreenedJob } from './filters'

// Pre-screen UI: rule gates (location, function, seniority) then a job-fit model trained on local
// verdict-small embeddings sort unevaluated jobs into likely / needs-agent / unlikely before a full agent run. Never discards.

export const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? '' : 's'}`
const NONE: Record<string, PrescreenEntry> = {}
const METHOD: Record<string, string> = { model: 'trained model', rules: 'rules' }
export const unevaluated = (j: ScreenedJob) => j.reportNum === null && /^https?:\/\//i.test(j.url)

function summarize(r: PrescreenRun): string {
  const drops = Object.entries(r.dropped).map(([g, n]) => `${g} ${n}`).join(', ')
  return `Pre-screened ${plural(Object.keys(r.results).length, 'job')} with ${METHOD[r.method]}: ${r.counts.likely} likely, ${r.counts.uncertain} need the agent, ${r.counts.unlikely} unlikely${drops ? ` (${drops})` : ''}`
}

/** Stored results + policy/model status + a runner. Results the profile or policy has outgrown are re-screened once, quietly. */
export function usePrescreen(generation: number) {
  const polled = usePolled(() => careerloom.readPrescreen(), [generation], { intervalMs: 60_000 })
  const [status, setStatus] = useState<PrescreenStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const autoRan = useRef(false)
  const map: Record<string, PrescreenEntry> = polled.data ?? NONE

  const reloadStatus = () => careerloom.prescreenStatus().then(setStatus, () => setStatus(null))
  useEffect(() => { void reloadStatus() }, [generation])

  const run = async (ids: string[] = [], quiet = false) => {
    setBusy(true)
    try {
      const r = await careerloom.prescreenJobs(ids)
      // A cold-start note ("Rules only — mark ~10 jobs…") is guidance, not a failure.
      if (!quiet) showToast(r.note ? `${summarize(r)} · ${r.note}` : summarize(r), r.note?.startsWith('Local model failed') ? 'error' : undefined, r.note ? 6000 : undefined)
      polled.refresh()
      void reloadStatus()
    } catch (err) {
      showToast(normalizeCliError(err).message, 'error', 6000)
    } finally {
      setBusy(false)
    }
  }

  const staleIds = Object.entries(map).filter(([, e]) => e.stale).map(([id]) => id)
  useEffect(() => {
    if (!staleIds.length || busy || autoRan.current) return
    autoRan.current = true
    void run(staleIds, true)
  }, [staleIds.length, busy]) // eslint-disable-line react-hooks/exhaustive-deps

  return { map, status, busy, run, reloadStatus, refresh: polled.refresh }
}

const TONE = { likely: 'success', uncertain: 'warn', unlikely: 'neutral' } as const
const LABEL = { likely: 'Likely fit', uncertain: 'Needs agent', unlikely: 'Unlikely' } as const

/** The bucket as a pill; the tooltip carries the deciding gate's reason and the method. */
export function ScreenBadge({ entry }: { entry?: PrescreenEntry }) {
  if (!entry) return <span className="text-muted-foreground">—</span>
  const why = `${entry.reason} (${METHOD[entry.method] ?? entry.method})${entry.stale ? ' · profile or settings changed since — re-screen' : ''}`
  return (
    <Badge variant={TONE[entry.bucket]} title={why} aria-label={`${LABEL[entry.bucket]}: ${why}`} className={entry.stale ? 'opacity-60' : undefined}>
      {LABEL[entry.bucket]}
    </Badge>
  )
}

type Controls = {
  jobs: ScreenedJob[]
  selected: ScreenedJob[]
  prescreen: ReturnType<typeof usePrescreen>
  onEvaluate: (ids: string[]) => Promise<boolean>
}

/** Pre-screen action, settings (method badge), and "Evaluate likely fits". */
export function PrescreenControls({ jobs, selected, prescreen, onEvaluate }: Controls) {
  const { status, busy, run } = prescreen
  const [confirm, setConfirm] = useState(false)
  const picked = selected.filter(unevaluated)
  const likely = jobs.filter(j => unevaluated(j) && j.screen?.bucket === 'likely')
  const pending = jobs.filter(j => unevaluated(j) && !j.screen).length

  return (
    <div className="row-actions ml-auto" role="group" aria-label="Pre-screen">
      {status && <PrescreenSettings status={status} prescreen={prescreen} />}
      <Button
        variant="outline" size="sm" className="h-8 gap-1 text-xs" disabled={busy}
        onClick={() => void run(picked.map(j => j.id))}
        title="Sort unevaluated jobs into likely / needs agent / unlikely before paying for full evaluations"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Filter className="h-3.5 w-3.5" />}
        {busy ? 'Pre-screening…' : picked.length ? `Pre-screen ${picked.length} selected` : `Pre-screen${pending ? ` ${pending} new` : ' all'}`}
      </Button>
      {likely.length > 0 && (
        <Button size="sm" className="h-8 text-xs" disabled={busy} onClick={() => setConfirm(true)}>Evaluate {plural(likely.length, 'likely fit')}</Button>
      )}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Evaluate {plural(likely.length, 'likely fit')}?</AlertDialogTitle>
            <AlertDialogDescription>
              Each one is a full agent evaluation. Jobs marked “Needs agent” aren't included — select them to evaluate them too.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => void onEvaluate(likely.map(j => j.id))}>Evaluate {likely.length}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}

export const pts = (gain: number) => `${gain >= 0 ? '+' : ''}${Math.round(gain * 100)} pts`
const enoughLabels = (s: PrescreenStatus) => s.labels.pos >= 5 && s.labels.neg >= 5
const personal = (s: PrescreenStatus) => enoughLabels(s) && s.model?.personal ? s.model : null
export const methodLabel = (s: PrescreenStatus) => {
  if (!s.available || s.reason) return 'Rules only'
  const m = personal(s)
  return m ? `Base + personal · ${m.n} labels · ${pts(m.gain)}` : 'Base model (public data)'
}
/** Why the personal layer isn't in use (null when it is, or without a model). */
const personalNote = (s: PrescreenStatus) =>
  !s.available || s.reason || personal(s) ? null
    : !enoughLabels(s) ? `Personal layer not used yet — needs 5 Relevant and 5 Not relevant (you have ${s.labels.pos} and ${s.labels.neg}).`
      : s.model ? `Personal layer not used — it didn’t beat the base model (${pts(s.model.gain)} in cross-validation). More marks may change that.`
        : 'Personal layer trains at the next pre-screen.'

/** Train the personal layer, report whether it beat the base model, then re-screen. Shared by the Jobs popover and Settings › Jobs. */
export async function retrainAndReport(rescreen: () => Promise<void>): Promise<void> {
  const m = await careerloom.retrainPrescreen()
  showToast(m.personal
    ? `Personal layer on ${plural(m.n, 'label')} beats the base model by ${pts(m.gain)} — in use`
    : `Personal layer on ${plural(m.n, 'label')} didn’t beat the base model (${pts(m.gain)}) — keeping the base model`)
  await rescreen()
}

export const policySummary = (p: PrescreenPolicy): string =>
  `${p.countries.length ? p.countries.join(', ') : 'Any location'} · remote-anywhere ${p.remoteAnywhere ? 'included' : 'to “Needs agent”'} · ${p.years === null ? 'no seniority check' : `up to ${p.years} years`}`

/** Read-only popover: the policy and model in one line each, Retrain, and a link to the one editor (Settings › Jobs). */
export function PrescreenSettings({ status, prescreen }: { status: PrescreenStatus; prescreen: ReturnType<typeof usePrescreen> }) {
  const [working, setWorking] = useState(false)
  const retrain = async () => {
    setWorking(true)
    try { await retrainAndReport(() => prescreen.run()) } catch (err) { showToast(normalizeCliError(err).message, 'error', 6000) } finally { setWorking(false) }
  }
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" className="cursor-pointer rounded-full focus-visible:outline-2 focus-visible:outline-(--accent-text)" aria-label={`Pre-screen settings — ${methodLabel(status)}`}>
          <Badge variant={status.available && !status.reason ? 'info' : 'neutral'} title={status.groups.length ? `Target occupations: ${status.groups.join('; ')}` : undefined}>{methodLabel(status)}</Badge>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 space-y-3 text-sm" align="end">
        <div className="space-y-1">
          <p className="font-medium">Where you're searching</p>
          <p className="text-muted-foreground">{policySummary(status.policy)}</p>
        </div>
        <div className="space-y-1 border-t border-(--line) pt-3">
          <p className="font-medium">Job-fit model</p>
          <p className="text-muted-foreground">{modelNote(status)}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {status.available && (
            <Button size="sm" variant="outline" className="h-8 text-xs" disabled={working || prescreen.busy} onClick={() => void retrain()}>
              {working && <Loader2 className="h-3.5 w-3.5 animate-spin" />}Retrain
            </Button>
          )}
          <SettingChip label="Pre-screen policy" page="jobs" focus="prescreen" />
        </div>
      </PopoverContent>
    </Popover>
  )
}

/** One paragraph on which model is scoring jobs and why the personal layer is or isn't in use. */
export const modelNote = (s: PrescreenStatus): string =>
  !s.available || s.reason
    ? (s.reason ?? 'No local model yet — pre-screening uses rules only.')
    : personal(s)
      ? `Base model plus a personal layer from ${plural(s.model!.n, 'label')} (${s.model!.pos} relevant, ${s.model!.neg} not); it beat the base by ${pts(s.model!.gain)} in cross-validation. Retrains when your ratings or marks change.`
      : `Base model (public data): scores titles against your profile’s target occupations. ${personalNote(s)}`

/** "Relevant" / "Not relevant": the user's own label — overrides the bucket and trains the model. */
export function FeedbackButtons({ job, onChange }: { job: ScreenedJob; onChange: (e: PrescreenEntry | null) => void }) {
  const current = job.screen?.gate === 'feedback' ? job.screen.bucket === 'likely' : null
  const mark = (v: boolean) => careerloom.prescreenFeedback(job.id, current === v ? null : v).then(onChange, err => showToast(normalizeCliError(err).message, 'error'))
  return (
    <div className="flex gap-2" role="group" aria-label="Pre-screen feedback">
      <Button size="sm" variant={current === true ? 'default' : 'outline'} className="h-8 text-xs" aria-pressed={current === true} onClick={() => void mark(true)}>Relevant</Button>
      <Button size="sm" variant={current === false ? 'default' : 'outline'} className="h-8 text-xs" aria-pressed={current === false} onClick={() => void mark(false)}>Not relevant</Button>
    </div>
  )
}

/** Row-sized 👍/👎 for the table, so ~10 labels don't need 10 sheet opens. */
export function QuickFeedback({ job, onChange }: { job: ScreenedJob; onChange: () => void }) {
  const current = job.screen?.gate === 'feedback' ? job.screen.bucket === 'likely' : null
  const mark = (v: boolean) => careerloom.prescreenFeedback(job.id, current === v ? null : v).then(onChange, err => showToast(normalizeCliError(err).message, 'error'))
  const btn = (v: boolean, Icon: typeof ThumbsUp, label: string) => (
    <button type="button" aria-label={`${label}: ${job.title}`} aria-pressed={current === v} title={label}
      className={`cursor-pointer rounded p-1 hover:bg-muted focus-visible:outline-2 focus-visible:outline-(--accent-text) ${current === v ? 'text-(--accent-text)' : 'text-muted-foreground'}`}
      onClick={e => { e.stopPropagation(); void mark(v) }}>
      <Icon className="h-3.5 w-3.5" />
    </button>
  )
  return <span className="inline-flex">{btn(true, ThumbsUp, 'Relevant')}{btn(false, ThumbsDown, 'Not relevant')}</span>
}

/** Warn — never block — when jobs about to be evaluated were pre-screened as unlikely. */
export function useUnlikelyGuard(evaluate: (ids: string[]) => Promise<boolean>, onDone?: () => void) {
  const [pending, setPending] = useState<ScreenedJob[] | null>(null)
  const guard = (jobs: ScreenedJob[]): Promise<boolean> => {
    if (!jobs.some(j => j.screen?.bucket === 'unlikely')) return evaluate(jobs.map(j => j.id))
    setPending(jobs)
    return Promise.resolve(false)
  }
  const unlikely = pending?.filter(j => j.screen?.bucket === 'unlikely') ?? []
  const rest = pending?.filter(j => j.screen?.bucket !== 'unlikely') ?? []
  const go = (list: ScreenedJob[]) => { setPending(null); void evaluate(list.map(j => j.id)).then(ok => { if (ok) onDone?.() }) }
  const dialog = (
    <AlertDialog open={pending !== null} onOpenChange={o => { if (!o) setPending(null) }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{unlikely.length === 1 && rest.length === 0 ? 'This job was' : `${plural(unlikely.length, 'job')} ${unlikely.length === 1 ? 'was' : 'were'}`} pre-screened as unlikely</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-1">
              {unlikely.slice(0, 4).map(j => <div key={j.id}><span className="font-medium text-foreground">{j.title || 'Untitled'}</span> — {j.screen!.reason}</div>)}
              {unlikely.length > 4 && <div>…and {unlikely.length - 4} more.</div>}
              <div className="pt-1">You can still evaluate them; each is a full agent run.</div>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          {rest.length > 0 && <Button variant="outline" onClick={() => go(rest)}>Skip unlikely ({rest.length})</Button>}
          <AlertDialogAction onClick={() => go(pending ?? [])}>Evaluate {pending?.length === 1 ? 'anyway' : `all ${pending?.length ?? 0}`}</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
  return { guard, dialog }
}
