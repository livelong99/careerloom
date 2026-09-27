import { History } from 'lucide-react'

import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

import type { ScanHistoryRow } from '../../lib/types'
import { EmptyState } from '../kit/EmptyState'
import { openRuns } from '../RunsDrawer'

const STATUS_TONE = { done: 'success', failed: 'danger', cancelled: 'neutral', running: 'info' } as const
const SPARK = 30

function duration(ms: number | null): string {
  if (ms === null) return '—'
  const s = Math.round(ms / 1000)
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${String(s % 60).padStart(2, '0')}s`
}
const n = (v: number | null) => (v === null ? '—' : v.toLocaleString())

/** New jobs per scan, oldest → newest, as plain bars (no chart lib needed at this size). */
function NewJobsBars({ scans }: { scans: ScanHistoryRow[] }) {
  const recent = scans.filter(s => s.added !== null).slice(0, SPARK).reverse()
  if (recent.length < 2) return null
  const max = Math.max(1, ...recent.map(s => s.added ?? 0))
  const total = recent.reduce((a, s) => a + (s.added ?? 0), 0)
  return (
    <div className="flex shrink-0 items-end gap-3 rounded-md border border-(--line) bg-(--panel) px-3 py-2">
      <div className="text-xs text-muted-foreground">
        <div>New jobs, last {recent.length} scans</div>
        <div className="text-base font-semibold tabular-nums text-foreground">{total.toLocaleString()}</div>
      </div>
      <div className="flex h-10 items-end gap-1" role="img" aria-label={`New jobs per scan: ${recent.map(s => s.added).join(', ')}`}>
        {recent.map(s => (
          <div
            key={s.id} title={`${new Date(s.startedAt).toLocaleString()}: ${s.added} new`}
            className="w-2 max-w-3 flex-1 rounded-t-sm bg-(--accent)"
            style={{ height: `${Math.max(6, ((s.added ?? 0) / max) * 100)}%`, opacity: s.added ? 1 : 0.35 }}
          />
        ))}
      </div>
    </div>
  )
}

/** Past scans, newest first: Careerloom runs merged with career-ops' scan-runs.tsv. */
export function ScansTable({ scans, onNewScan }: { scans: ScanHistoryRow[]; onNewScan: () => void }) {
  if (!scans.length) return <EmptyState icon={History} title="No scans yet" message="Scan your enabled boards to find new jobs; every scan is listed here with what it found." action="New scan" onAction={onNewScan} hideActionIcon />
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <NewJobsBars scans={scans} />
      <div className="fill-scroll">
        <Table className="tbl">
          <TableHeader>
            <TableRow>
              <TableHead>Started</TableHead>
              <TableHead>Scan</TableHead>
              <TableHead>Duration</TableHead>
              <TableHead>Found</TableHead>
              <TableHead>New</TableHead>
              <TableHead>Duplicates</TableHead>
              <TableHead>Status</TableHead>
              <TableHead className="w-24"><span className="sr-only">Log</span></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {scans.map(s => (
              <TableRow key={s.id}>
                <TableCell className="whitespace-nowrap tabular-nums">{new Date(s.startedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</TableCell>
                <TableCell className="max-w-72">
                  <div className="truncate">{s.label}</div>
                  <div className="truncate text-xs text-muted-foreground" title={s.boards ?? undefined}>{s.boards ?? 'All enabled boards'}{s.source === 'career-ops' ? ' · outside Careerloom' : ''}</div>
                </TableCell>
                <TableCell className="tabular-nums">{duration(s.durationMs)}</TableCell>
                <TableCell className="tabular-nums">{n(s.found)}</TableCell>
                <TableCell className="tabular-nums">{s.added ? <span className="font-medium text-(--accent-text)">+{s.added.toLocaleString()}</span> : n(s.added)}</TableCell>
                <TableCell className="tabular-nums text-muted-foreground">{n(s.dupes)}</TableCell>
                <TableCell>
                  {s.status === 'done' && s.errors
                    ? <Badge variant="warn" title="These boards errored; the rest finished — see View log">done · {s.errors} board error{s.errors === 1 ? '' : 's'}</Badge>
                    : <Badge variant={STATUS_TONE[s.status]}>{s.status === 'cancelled' ? 'stopped' : s.status}</Badge>}
                </TableCell>
                <TableCell>
                  {s.runId && <Button variant="ghost" size="sm" className="h-7" onClick={() => openRuns(s.runId)} aria-label={`View log of ${s.label}`}>View log</Button>}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  )
}
