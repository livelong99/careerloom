import { Download, Trash2 } from 'lucide-react'
import { useMemo, useState } from 'react'

import { AnswerReview } from '@/components/copilot/AnswerReview'
import { Group } from '@/components/copilot/Group'
import { RetentionControl } from '@/components/copilot/RetentionControl'
import { ScoreCard } from '@/components/copilot/ScoreCard'
import { dateLabel, groupByJob, minutesLabel, scoreLabel, type JobGroup } from '@/components/copilot/sessionsFormat'
import { TranscriptDialog } from '@/components/copilot/TranscriptDialog'
import { useSessionDetail } from '@/components/copilot/useSessionDetail'
import { errorText, useAsync, useCopilotConfig } from '@/components/copilot/api'
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { careerloom } from '@/lib/ipc'
import { openJob } from '@/lib/jobNav'
import { showToast } from '@/lib/toast'
import type { SessionSummary } from '@/lib/types'
import { cn } from '@/lib/utils'
import { Page } from '../resume/PageStub'

const th = 'px-3 py-2 text-left text-xs font-medium text-muted-foreground'

export function SessionsPage() {
  const { config, save } = useCopilotConfig()
  const sessions = useAsync(() => careerloom.copilotListSessions(), [])
  const jobs = useAsync(() => careerloom.listJobs(), [])
  const [selected, setSelected] = useState<string | null>(null)
  const [reader, setReader] = useState(false)
  const [confirm, setConfirm] = useState<'one' | 'all' | null>(null)
  const groups = useMemo(() => groupByJob(sessions.data ?? []), [sessions.data])
  const pick = selected ?? groups[0]?.sessions[0]?.id ?? null
  const detail = useSessionDetail(pick)
  const existing = useMemo(() => new Set((jobs.data ?? []).map(j => j.id)), [jobs.data])
  const previous = useMemo(() => {
    const g = groups.find(x => x.sessions.some(s => s.id === pick))
    const scored = (g?.sessions ?? []).filter(s => s.score !== null)
    const i = scored.findIndex(s => s.id === pick)
    return i >= 0 && scored[i + 1] && scored[i]!.score !== null ? scored[i]!.score! - scored[i + 1]!.score! : null
  }, [groups, pick])

  async function remove(what: 'one' | 'all'): Promise<void> {
    try {
      const n = await careerloom.copilotDeleteSession(what === 'all' ? 'all' : pick ?? '')
      showToast(`Deleted ${n} ${n === 1 ? 'session' : 'sessions'}`)
      setSelected(null); sessions.reload()
    } catch (e) { showToast(errorText(e), 'error') }
  }
  async function exportConsents(): Promise<void> {
    try { showToast(`Consent records saved to ${await careerloom.copilotExportConsents()}`) } catch (e) { showToast(errorText(e), 'error') }
  }

  return (
    <Page title="Sessions & debrief" blurb="Every session belongs to a job, and a job can have many sessions. Review how an answer landed and move the good parts into your résumé and job notes.">
      {config && (
        <div role="note" className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-muted-foreground">
          Transcripts are kept for <RetentionControl value={config.privacy.retentionDays} onChange={d => { void save({ privacy: { retentionDays: d } }).then(() => sessions.reload()) }} />, then deleted.
        </div>
      )}
      {groups.length === 0 && !sessions.loading && <Group><p className="m-0 text-sm text-muted-foreground">No sessions yet. Start a practice session from Setup or Practice.</p></Group>}
      {groups.map(g => <JobTable key={g.jobId} group={g} selected={pick} onSelect={setSelected} jobExists={existing.has(g.jobId)} />)}
      {detail.data && (
        <div className="grid items-start gap-4 lg:grid-cols-[1fr_1.3fr]">
          <ScoreCard card={detail.data.scorecard} delta={previous} pending={detail.scoring} />
          <AnswerReview session={detail.data} onTranscript={() => setReader(true)} />
        </div>
      )}
      <div className="flex flex-wrap gap-2">
        {detail.data && <Button size="sm" variant="outline" onClick={() => setReader(true)}>Reader view</Button>}
        {detail.data && <Button size="sm" variant="outline" onClick={() => setConfirm('one')}><Trash2 className="size-3.5" aria-hidden />Delete this session</Button>}
        {groups.length > 0 && <Button size="sm" variant="outline" onClick={() => setConfirm('all')}>Delete all sessions</Button>}
        <Button size="sm" variant="outline" onClick={() => { void exportConsents() }}><Download className="size-3.5" aria-hidden />Export consent records</Button>
      </div>
      <TranscriptDialog session={detail.data} open={reader} onOpenChange={setReader} />
      <AlertDialog open={confirm !== null} onOpenChange={o => { if (!o) setConfirm(null) }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirm === 'all' ? 'Delete all sessions?' : 'Delete this session?'}</AlertDialogTitle>
            <AlertDialogDescription>Transcript, scorecard and notes are removed from this computer. Consent records are kept until you delete them separately. This cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter><AlertDialogCancel>Keep</AlertDialogCancel><AlertDialogAction onClick={() => { if (confirm) void remove(confirm); setConfirm(null) }}>Delete</AlertDialogAction></AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </Page>
  )
}

function JobTable({ group, selected, onSelect, jobExists }: { group: JobGroup; selected: string | null; onSelect: (id: string) => void; jobExists: boolean }) {
  return (
    <Group title={group.jobTitle} action={<>
      <Badge>{group.company}</Badge>
      {group.first !== null && group.last !== null && <Badge variant="success">Trend {group.first.toFixed(1)} → {group.last.toFixed(1)}</Badge>}
      <Button size="sm" variant="outline" disabled={!jobExists} title={jobExists ? undefined : 'This job is no longer in your list. Its sessions are kept.'} onClick={() => openJob(group.jobId)}>Open job</Button>
    </>}>
      <table className="w-full border-collapse text-sm">
        <thead><tr><th className={th}>Date</th><th className={th}>Mode</th><th className={th}>Length</th><th className={th}>Answers</th><th className={th}>Score</th></tr></thead>
        <tbody>{group.sessions.map(s => <Row key={s.id} s={s} on={s.id === selected} onSelect={onSelect} />)}</tbody>
      </table>
    </Group>
  )
}

function Row({ s, on, onSelect }: { s: SessionSummary; on: boolean; onSelect: (id: string) => void }) {
  return (
    <tr className={cn('cursor-pointer border-t border-border', on && 'bg-primary/10')} aria-selected={on} onClick={() => onSelect(s.id)}>
      <td className="px-3 py-2 tabular-nums"><button type="button" className="bg-transparent p-0 text-left text-inherit" onClick={() => onSelect(s.id)}>{dateLabel(s.startedAt)}</button></td>
      <td className="px-3 py-2"><Badge variant={s.mode === 'live' ? 'warn' : 'brand'}>{s.mode === 'live' ? 'Live' : 'Practice'}</Badge></td>
      <td className="px-3 py-2 tabular-nums">{s.endedAt === null ? 'Running' : minutesLabel(s.durationSec)}</td>
      <td className="px-3 py-2 tabular-nums">{s.questions}</td>
      <td className="px-3 py-2 tabular-nums">{scoreLabel(s.score)}</td>
    </tr>
  )
}
