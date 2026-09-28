// Pure Jobs logic: parse scan-history / pipeline.md / tracker into JobListings,
// the portals subset YAML, pipeline.md appends and the _custom.md guideline block.
// No `electron` import — tested directly by electron/jobs.test.ts.
import { parseDocument } from 'yaml'

import type { Application, PipelineItem, ReportMeta } from './careerops'
import type { JobListing, JobState, Portal } from './contract'
import { parseJobBoardUrl, type Source } from './integrations/sources'

export type ScanRow = {
  url: string; firstSeen: string | null; source: string | null; title: string; company: string
  location: string | null; postedAt: string | null; trustScore: number | null; trustFlags: string[]
}

/** scan.mjs normalizeScanUrl (first token) plus a trailing slash/fragment trim, so joins survive cosmetic drift. */
export function normUrl(raw: string): string {
  return (raw.trim().split(/\s+/)[0] ?? '').replace(/#.*$/, '').replace(/\/+$/, '')
}

/** Company key close to career-ops' normalizeCompanyName: lowercased, legal suffixes and punctuation dropped. */
export function companyKey(name: string): string {
  return name.toLowerCase().replace(/[,.]?\s*\b(inc|llc|ltd|gmbh|corp|corporation|co|plc|sa|ag|bv)\b\.?\s*$/i, '').replace(/[^a-z0-9]+/g, '')
}

const cell = (v: string | undefined) => (v ?? '').trim().replace(/^'(?=[=+\-@])/, '') || null

/** data/scan-history.tsv (formatScanHistoryRow). Tolerates the header, short legacy rows and 3-col url/date/title rows. */
export function parseScanHistory(text: string): ScanRow[] {
  const rows: ScanRow[] = []
  for (const line of text.split(/\r?\n/)) {
    const c = line.split('\t')
    if (!/^https?:\/\//i.test(c[0]?.trim() ?? '')) continue
    const legacy = c.length === 3
    rows.push({
      url: normUrl(c[0]!),
      firstSeen: cell(c[1]),
      source: legacy ? null : cell(c[2]),
      title: cell(legacy ? c[2] : c[3]) ?? '',
      company: cell(c[4]) ?? '',
      location: cell(c[6]),
      postedAt: cell(c[8]),
      trustScore: cell(c[9]) ? Number(c[9]) : null,
      trustFlags: (cell(c[10]) ?? '').split(',').map(s => s.trim()).filter(Boolean),
    })
  }
  return rows
}

const STATE_OF: Record<string, JobState> = {
  evaluated: 'evaluated', applied: 'applied', responded: 'applied', interview: 'interview',
  offer: 'offer', hired: 'offer', rejected: 'closed', discarded: 'closed',
  skip: 'evaluated', // the agent's verdict on an evaluated job, not a user close
}
// Aliases career-ops' localized modes write (mirrors renderer/lib/stages.ts).
const ALIASES: Record<string, string> = {
  evaluada: 'evaluated', condicional: 'evaluated', hold: 'evaluated', aplicado: 'applied', aplicada: 'applied', enviada: 'applied', sent: 'applied',
  respondido: 'responded', entrevista: 'interview', oferta: 'offer', contratado: 'hired', contratada: 'hired', accepted: 'hired',
  rechazado: 'rejected', rechazada: 'rejected', descartado: 'discarded', descartada: 'discarded', cerrada: 'discarded', cancelada: 'discarded',
  no_aplicar: 'skip', 'no aplicar': 'skip', monitor: 'skip',
}
export function stateOfStatus(status: string): JobState {
  const s = status.trim().toLowerCase().replace(/\*/g, '')
  return STATE_OF[ALIASES[s] ?? s] ?? 'evaluated'
}

export const portalAts = (s: Source): string | null =>
  s.provider ?? parseJobBoardUrl(s.careers_url ?? '')?.provider ?? parseJobBoardUrl(s.api ?? '')?.provider ?? null

export type JobInputs = {
  scan: ScanRow[]
  pipeline: PipelineItem[]
  tracker: Application[]
  reports: ReportMeta[]
  sources: Source[]
  /** cv.md mtime (ms) and per-report mtimes (reports/<file> → ms) for the stale check. */
  cvMtime: number | null
  reportMtime: (file: string) => number | null
}

const reportNumOf = (file: string | null) => {
  const m = /(?:^|\/)(\d+)[^/]*$/.exec(file ?? '')
  return m ? Number(m[1]) : null
}

export function deriveJobs(input: JobInputs): JobListing[] {
  const portalByKey = new Map(input.sources.map(s => [companyKey(s.name), s]))
  const jobs = new Map<string, JobListing>()
  const blank = (url: string, title: string, company: string): JobListing => {
    const portal = portalByKey.get(companyKey(company)) ?? null
    return {
      id: url, url, title, company, portalId: portal?.id ?? null, ats: portal ? portalAts(portal) : null,
      location: null, postedAt: null, firstSeen: null, trustScore: null, trustFlags: [], state: 'new',
      status: null, score: null, reportNum: null, reportPath: null, evaluatedAt: null, stale: false,
    }
  }
  for (const r of input.scan) {
    if (jobs.has(r.url)) continue
    const job = blank(r.url, r.title, r.company)
    jobs.set(r.url, { ...job, ats: job.ats ?? r.source, location: r.location, postedAt: r.postedAt, firstSeen: r.firstSeen, trustScore: r.trustScore, trustFlags: r.trustFlags })
  }
  for (const p of input.pipeline) {
    const url = normUrl(p.url)
    if (!/^https?:\/\//i.test(url)) continue
    const job = jobs.get(url) ?? blank(url, p.role ?? '', p.company ?? '')
    const num = p.done ? /^\s*-\s*\[[xX]\]\s*(?:#(\d+)|\[(\d+)\])/.exec(p.raw)?.slice(1).find(Boolean) : undefined
    const score = p.done ? /\|\s*(\d+(?:\.\d+)?)\/5\s*(?:\||$)/.exec(p.raw)?.[1] : undefined
    jobs.set(url, {
      ...job,
      title: job.title || p.role || '', company: job.company || p.company || '',
      state: p.done ? 'evaluated' : 'queued', // the tracker row, when merged, refines this below
      reportNum: num ? Number(num) : job.reportNum, score: score ? Number(score) : job.score,
    })
  }
  // Tracker rows join by their report's URL, then report number, then company + role.
  const urlByReport = new Map(input.reports.filter(r => r.url).map(r => [`reports/${r.file}`, normUrl(r.url!)]))
  const byNum = new Map([...jobs.values()].filter(j => j.reportNum !== null).map(j => [j.reportNum!, j.id]))
  const byName = new Map([...jobs.values()].map(j => [`${companyKey(j.company)}|${j.title.toLowerCase()}`, j.id]))
  for (const app of input.tracker) {
    const rnum = reportNumOf(app.report) ?? app.num
    const id = (app.report && urlByReport.get(app.report)) || byNum.get(rnum) || byName.get(`${companyKey(app.company)}|${app.role.toLowerCase()}`)
    const job = (id && jobs.get(id)) || blank(id || `tracker:${app.num}`, app.role, app.company)
    const reportMs = app.report ? input.reportMtime(app.report) : null
    const state = stateOfStatus(app.status)
    const evaluatedAt = /^\d{4}-\d{2}-\d{2}/.test(app.date) ? app.date.slice(0, 10) : reportMs ? new Date(reportMs).toISOString().slice(0, 10) : null
    const evaluatedMs = reportMs ?? (evaluatedAt ? Date.parse(evaluatedAt) : null)
    jobs.set(job.id, {
      ...job,
      title: job.title || app.role, company: job.company || app.company,
      state, status: app.status, score: app.score ?? job.score, reportNum: app.num,
      reportPath: app.report, evaluatedAt,
      stale: state === 'evaluated' && input.cvMtime !== null && evaluatedMs !== null && evaluatedMs < input.cvMtime,
    })
  }
  return [...jobs.values()]
}

export function derivePortals(sources: Source[], jobs: JobListing[], guidelines: Map<string, string>): Portal[] {
  return sources.map(s => {
    const mine = jobs.filter(j => j.portalId === s.id)
    const lastSeen = mine.reduce<string | null>((max, j) => (j.firstSeen && (!max || j.firstSeen > max) ? j.firstSeen : max), null)
    return {
      id: s.id, name: s.name, ats: portalAts(s), careersUrl: s.careers_url ?? null, enabled: s.enabled !== false,
      category: typeof s.category === 'string' ? s.category : null,
      jobCount: mine.length,
      newCount: mine.filter(j => j.state === 'new' && j.firstSeen === lastSeen).length,
      lastSeen, guideline: guidelines.get(s.name) ?? null,
    }
  })
}

/** portals.yml trimmed to the chosen tracked_companies (forced enabled); job_boards/search_queries dropped so only those portals are scanned. */
export function subsetPortalsYaml(text: string, names: string[]): string {
  const doc = parseDocument(text)
  const all = (doc.toJS() as { tracked_companies?: Array<Record<string, unknown>> } | null)?.tracked_companies ?? []
  doc.delete('job_boards')
  doc.delete('search_queries')
  doc.set('tracked_companies', all.filter(c => names.includes(String(c.name))).map(c => ({ ...c, enabled: true })))
  return String(doc)
}

const PENDING = /^##\s+(Pending|Pendientes)\s*$/i
const PROCESSED = /^##\s+(Processed|Procesadas)\s*$/i
const safe = (s: string) => s.replace(/[\r\n]+/g, ' ').replace(/\|/g, '/').trim()

/** Append `- [ ] url | Company | Role` rows under ## Pending (modes/pipeline.md format). Skips URLs already
 *  pending; skips processed ones unless `force` (re-evaluate). Never drops existing lines. */
export function appendPending(text: string, entries: Array<{ url: string; company: string; title: string }>, force = false): { text: string; added: number } {
  const lines = text ? text.split('\n') : ['# Pipeline', '', '## Pending', '', '## Processed', '']
  let start = lines.findIndex(l => PENDING.test(l.trim()))
  if (start < 0) { lines.push('', '## Pending', ''); start = lines.length - 2 }
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l.trim()))
  if (end < 0) end = lines.length
  const urlOf = (l: string) => { const m = /^\s*-\s*\[(.)\]\s*(?:#\S+\s*\|\s*)?(\S+)/.exec(l); return m ? { mark: m[1]!, url: normUrl(m[2]!) } : null }
  const pending = new Set<string>()
  const processed = new Set<string>()
  let inProcessed = false
  lines.forEach((l, i) => {
    if (PROCESSED.test(l.trim())) inProcessed = true
    else if (/^##\s/.test(l.trim())) inProcessed = false
    const u = urlOf(l)
    if (!u) return
    if (i > start && i < end && u.mark === ' ') pending.add(u.url)
    else if (inProcessed || u.mark.toLowerCase() === 'x') processed.add(u.url)
  })
  const rows: string[] = []
  for (const e of entries) {
    const url = normUrl(e.url)
    if (!/^https?:\/\//i.test(url) || pending.has(url) || (!force && processed.has(url))) continue
    pending.add(url)
    rows.push(`- [ ] ${url.replace(/\|/g, '%7C')} | ${safe(e.company) || '—'} | ${safe(e.title) || '—'}`)
  }
  if (!rows.length) return { text, added: 0 }
  // After the last row (or the heading's blank line), keeping the blank line before the next section.
  const floor = lines[start + 1]?.trim() === '' ? start + 2 : start + 1
  let at = end
  while (at > floor && !lines[at - 1]!.trim()) at--
  lines.splice(at, 0, ...rows)
  return { text: lines.join('\n'), added: rows.length }
}

export const GUIDELINES_HEADING = '## Portal guidelines (managed by Careerloom)'

function blockRange(lines: string[]): [number, number] | null {
  const start = lines.findIndex(l => l.trim() === GUIDELINES_HEADING)
  if (start < 0) return null
  const next = lines.findIndex((l, i) => i > start && /^##\s/.test(l))
  return [start, next < 0 ? lines.length : next]
}

export function readGuidelines(text: string): Map<string, string> {
  const lines = text.split('\n')
  const range = blockRange(lines)
  const out = new Map<string, string>()
  if (!range) return out
  let name: string | null = null
  let body: string[] = []
  const flush = () => { if (name) out.set(name, body.join('\n').trim()) }
  for (const l of lines.slice(range[0] + 1, range[1])) {
    const h = /^###\s+(.+?)\s*$/.exec(l)
    if (h) { flush(); name = h[1]!; body = [] } else body.push(l)
  }
  flush()
  return out
}

/** Set (or remove, when empty) one company's guideline inside the managed block; everything else is preserved. */
/** User text goes into a file every agent reads as house rules: no line may start a heading
 *  (which would forge another company's section or escape the managed block). */
export function sanitizeGuideline(raw: string): string {
  if (raw.includes('\0')) throw new Error('Guideline contains an invalid character')
  return raw.replace(/\r\n?/g, '\n').split('\n').map(l => l.replace(/^(\s*)#+\s*/, '$1')).join('\n').trim()
}
export const sanitizeName = (name: string) => name.replace(/[#\0\s]+/g, ' ').trim()

export function upsertGuideline(text: string, company: string, guideline: string): string {
  const all = readGuidelines(text)
  const name = sanitizeName(company)
  const body = sanitizeGuideline(guideline)
  if (body) all.set(name, body); else all.delete(name)
  const block = all.size
    ? [GUIDELINES_HEADING, '', ...[...all].flatMap(([n, g]) => [`### ${n}`, '', g, ''])]
    : []
  const lines = text ? text.split('\n') : []
  const range = blockRange(lines)
  if (range) lines.splice(range[0], range[1] - range[0], ...block)
  else if (block.length) lines.push(...(lines.length && lines[lines.length - 1]!.trim() ? [''] : []), ...block)
  return lines.join('\n')
}
