// Scan history for the Boards screen: career-ops' data/scan-runs.tsv (one row per
// scan.mjs run, with counts) merged with Careerloom's tracked scan runs (runs.jsonl),
// plus the latest data/portal-health.tsv status per portal. Pure — tested directly.
import type { ScanHistoryRow } from './contract'
import { SECRETISH } from './log-redact'

export type ScanRunRow = { at: number; status: string; companies: number; boards: number; found: number; dupes: number; added: number; errors: number }
type RunLike = { id: string; mode: string; label: string; input: string | null; startedAt: number; endedAt: number | null; status: string }

const MATCH_SLACK_MS = 15_000 // scan.mjs stamps its row just before it exits

function rows(tsv: string): Array<Record<string, string>> {
  const [head, ...lines] = tsv.split(/\r?\n/).filter(l => l.trim())
  if (!head) return []
  const cols = head.split('\t')
  return lines.map(l => Object.fromEntries(l.split('\t').map((v, i) => [cols[i] ?? `c${i}`, v])))
}

const num = (v: string | undefined) => (Number.isFinite(Number(v)) ? Number(v) : 0)

export function parseScanRuns(tsv: string): ScanRunRow[] {
  return rows(tsv).flatMap(r => {
    const at = Date.parse(r.timestamp ?? '')
    if (Number.isNaN(at)) return []
    return [{ at, status: r.status ?? '', companies: num(r.companies), boards: num(r.boards), found: num(r.found), dupes: num(r.dupes), added: num(r.new_added), errors: num(r.errors) }]
  })
}

/** Latest status per portal name from portal-health.tsv (timestamp, company, status). */
export function latestHealth(tsv: string): Map<string, { status: string; at: string }> {
  const out = new Map<string, { status: string; at: string }>()
  for (const r of rows(tsv)) {
    const name = r.company ?? ''
    const at = r.timestamp ?? ''
    if (name && (!out.has(name) || out.get(name)!.at < at)) out.set(name, { status: r.status ?? '', at })
  }
  return out
}

const sum = (list: ScanRunRow[], key: 'found' | 'added' | 'dupes' | 'errors') => (list.length ? list.reduce((a, r) => a + r[key], 0) : null)

/** Newest first. A Careerloom scan run absorbs the scan-runs.tsv rows stamped during it;
 *  rows no run claims are scans started outside Careerloom (terminal, other tools). */
export function mergeScanHistory(tsv: ScanRunRow[], runs: RunLike[], now = Date.now()): ScanHistoryRow[] {
  const claimed = new Set<ScanRunRow>()
  const fromRuns: ScanHistoryRow[] = runs.filter(r => r.mode === 'scan').map(r => {
    const end = (r.endedAt ?? now) + MATCH_SLACK_MS
    const mine = tsv.filter(t => !claimed.has(t) && t.at >= r.startedAt && t.at <= end)
    mine.forEach(t => claimed.add(t))
    return {
      id: r.id, runId: r.id, source: 'careerloom', label: r.label, boards: r.input, startedAt: r.startedAt,
      durationMs: r.endedAt ? r.endedAt - r.startedAt : null,
      status: r.status === 'done' || r.status === 'failed' || r.status === 'cancelled' ? r.status : 'running',
      found: sum(mine, 'found'), added: sum(mine, 'added'), dupes: sum(mine, 'dupes'), errors: sum(mine, 'errors'),
    }
  })
  const external: ScanHistoryRow[] = tsv.filter(t => !claimed.has(t)).map(t => ({
    id: `tsv:${t.at}`, runId: null, source: 'career-ops', label: 'Scan (career-ops)',
    boards: `${t.companies} companies${t.boards ? `, ${t.boards} boards` : ''}`, startedAt: t.at, durationMs: null,
    status: t.status === 'completed' ? 'done' : 'failed', found: t.found, added: t.added, dupes: t.dupes, errors: t.errors,
  }))
  return [...fromRuns, ...external].sort((a, b) => b.startedAt - a.startedAt)
}

const LOG_TAIL_LINES = 200

/** What a finished scan run keeps on disk: its last LOG_TAIL_LINES lines, minus anything credential-like. */
export function logTail(log: string): string {
  return log.split('\n').filter(l => !SECRETISH.test(l)).slice(-LOG_TAIL_LINES).join('\n')
}
