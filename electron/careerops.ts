// Reader for a career-ops data root: tracker table, pipeline inbox, and
// evaluation reports. Read-only — never writes into the user's data.
import fs from 'node:fs'
import path from 'node:path'

export type Application = {
  num: number
  date: string
  company: string
  via: string | null
  role: string
  score: number | null
  status: string
  pdf: boolean
  report: string | null
  notes: string
}

export type PipelineItem = { url: string; company: string | null; role: string | null; done: boolean; raw: string }

export type ReportMeta = { file: string; title: string; date: string | null; score: number | null; url: string | null }

export type CareerOpsCheck = { ok: true; root: string; dataRoot: string } | { ok: false; reason: string }

// Header labels the tracker table may use, mapped to our field names. Covers
// the EN column set (see career-ops modes/tracker.md); not the full localized
// alias table career-ops ships, since this UI only reads EN-authored trackers.
const TRACKER_ALIASES: Record<string, string> = {
  '#': 'num', num: 'num', date: 'date', company: 'company', via: 'via',
  role: 'role', score: 'score', status: 'status', pdf: 'pdf', materials: 'pdf',
  report: 'report', notes: 'notes',
}
const REQUIRED_HEADER_FIELDS = ['num', 'company', 'role', 'score', 'status']
const SEPARATOR_ROW_RE = /^\|(?:\s*:?-+:?\s*\|)+\s*$/

/** Resolve the tracker header row (in any column order) to field -> index. */
function detectColumns(lines: string[]): Record<string, number> | null {
  for (const line of lines) {
    if (!line.startsWith('|') || SEPARATOR_ROW_RE.test(line)) continue
    const map: Record<string, number> = {}
    line.split('|').map((s) => s.trim().toLowerCase()).forEach((c, i) => {
      const key = TRACKER_ALIASES[c]
      if (key) map[key] = i
    })
    if (REQUIRED_HEADER_FIELDS.every((k) => map[k] != null)) return map
  }
  return null
}

function parseScore(cell: string): number | null {
  const t = cell.replace(/\*\*/g, '').trim()
  const m = /^(\d+(?:\.\d+)?)\/5$/.exec(t)
  return m ? parseFloat(m[1]) : null
}

function parseReportLink(cell: string): string | null {
  const m = /\[[^\]]*\]\(([^)]+)\)/.exec(cell)
  return m ? m[1].trim() : null
}

function looksTrue(cell: string): boolean {
  const t = cell.trim()
  return t.includes('✅') || /^yes$/i.test(t) || /\[[^\]]*\]\([^)]+\)/.test(t)
}

function parseTrackerRow(line: string, colmap: Record<string, number>): Application | null {
  const cells = line.split('|').map((s) => s.trim())
  const at = (k: string) => (colmap[k] != null ? cells[colmap[k]] ?? '' : '')
  const num = parseInt(at('num'), 10)
  if (Number.isNaN(num)) return null // header/separator/malformed row
  const via = colmap.via != null ? at('via') : ''
  return {
    num,
    date: at('date'),
    company: at('company'),
    via: via && via !== '—' && via !== '-' ? via : null,
    role: at('role'),
    score: parseScore(at('score')),
    status: at('status').replace(/\*\*/g, '').trim(),
    pdf: looksTrue(at('pdf')),
    report: parseReportLink(at('report')),
    notes: at('notes'),
  }
}

/** CAREER_OPS_ROOT / CAREER_OPS_DATA_DIR env, then `.career-ops-data` marker, else root itself. */
function resolveDataRoot(root: string): string {
  const env = process.env.CAREER_OPS_ROOT?.trim() || process.env.CAREER_OPS_DATA_DIR?.trim()
  if (env) return path.resolve(root, env)
  const marker = path.join(root, '.career-ops-data')
  if (fs.existsSync(marker)) {
    const content = fs.readFileSync(marker, 'utf-8').trim()
    if (content) return path.resolve(root, content)
  }
  return root
}

export function checkRoot(root: string): CareerOpsCheck {
  if (!fs.existsSync(path.join(root, 'AGENTS.md'))) return { ok: false, reason: 'AGENTS.md not found in root' }
  const modesDir = path.join(root, 'modes')
  if (!fs.existsSync(modesDir) || !fs.statSync(modesDir).isDirectory()) {
    return { ok: false, reason: 'modes/ directory not found in root' }
  }
  return { ok: true, root, dataRoot: resolveDataRoot(root) }
}

export function readTracker(dataRoot: string): Application[] {
  const primary = path.join(dataRoot, 'data', 'applications.md')
  const fallback = path.join(dataRoot, 'applications.md')
  const file = fs.existsSync(primary) ? primary : fs.existsSync(fallback) ? fallback : null
  if (!file) return []
  const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/)
  const colmap = detectColumns(lines)
  if (!colmap) return []
  const apps: Application[] = []
  for (const line of lines) {
    if (!line.startsWith('|') || SEPARATOR_ROW_RE.test(line)) continue
    const row = parseTrackerRow(line, colmap)
    // Links are relative to the tracker file (`../reports/…` from data/); re-base on dataRoot.
    if (row) apps.push(row.report ? { ...row, report: path.relative(dataRoot, path.resolve(path.dirname(file), row.report)).split(path.sep).join('/') } : row)
  }
  return apps
}

export function readPipeline(dataRoot: string): PipelineItem[] {
  const file = path.join(dataRoot, 'data', 'pipeline.md')
  if (!fs.existsSync(file)) return []
  const lines = fs.readFileSync(file, 'utf-8').split(/\r?\n/)
  const items: PipelineItem[] = []
  const isLabel = (s: string) => /^(posted|trust|note|rank):/i.test(s)
  for (const line of lines) {
    const m = /^-\s*\[([ xX!])\]\s*(.*)$/.exec(line.trim())
    if (!m) continue
    const done = m[1].toLowerCase() === 'x'
    const positional = m[2].split('|').map((s) => s.trim()).filter((s) => s && !isLabel(s))
    // Processed rows lead with a claimed report number (#143 / #--); pending
    // rows lead straight with the URL. Either way url is the next cell.
    const offset = positional[0] && /^#/.test(positional[0]) ? 1 : 0
    const rawUrl = positional[offset] ?? ''
    items.push({
      url: rawUrl.split(/\s+—\s+/)[0].trim(), // strip a trailing "— Error: ..." note
      company: positional[offset + 1] ?? null,
      role: positional[offset + 2] ?? null,
      done,
      raw: line,
    })
  }
  return items
}

export function listReports(dataRoot: string): ReportMeta[] {
  const dir = path.join(dataRoot, 'reports')
  if (!fs.existsSync(dir)) return []
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.md'))
  const metas = files.map((file): ReportMeta => {
    const head = fs.readFileSync(path.join(dir, file), 'utf-8').split(/\r?\n/).slice(0, 40)
    let title = file
    let date: string | null = null
    let score: number | null = null
    let url: string | null = null
    for (const raw of head) {
      const line = raw.trim()
      if (title === file) {
        const h = /^#\s+(.+)$/.exec(line)
        if (h) title = h[1].trim()
      }
      const d = /^\*\*Date:\*\*\s*(.+)$/i.exec(line)
      if (d) date = d[1].trim()
      const s = /^\*\*Score:\*\*\s*(\d+(?:\.\d+)?)\/5/i.exec(line)
      if (s) score = parseFloat(s[1])
      const u = /^\*\*URL:\*\*\s*(\S+)/i.exec(line)
      if (u) url = u[1].trim()
    }
    return { file, title, date, score, url }
  })
  return metas.sort((a, b) => {
    const na = parseInt(a.file, 10)
    const nb = parseInt(b.file, 10)
    if (!Number.isNaN(na) && !Number.isNaN(nb) && na !== nb) return nb - na
    return b.file.localeCompare(a.file)
  })
}

/** Reads a report/output file. Throws on any path outside dataRoot/reports or dataRoot/output. */
export function readReport(dataRoot: string, rel: string): string {
  if (path.isAbsolute(rel)) throw new Error(`readReport: absolute paths are not allowed: ${rel}`)
  if (!rel.endsWith('.md')) throw new Error(`readReport: only .md files are allowed: ${rel}`)
  const reportsDir = path.resolve(dataRoot, 'reports')
  const outputDir = path.resolve(dataRoot, 'output')
  const target = path.resolve(dataRoot, rel)
  const inside = (dir: string) => target === dir || target.startsWith(dir + path.sep)
  if (!inside(reportsDir) && !inside(outputDir)) {
    throw new Error(`readReport: path escapes reports/output: ${rel}`)
  }
  return fs.readFileSync(target, 'utf-8')
}

/** Counts applications per status, case-insensitively, keyed by first-seen display text. */
export function statusCounts(apps: Application[]): Record<string, number> {
  const counts: Record<string, number> = {}
  const keyFor: Record<string, string> = {}
  for (const a of apps) {
    const norm = a.status.toLowerCase()
    const key = keyFor[norm] ?? (keyFor[norm] = a.status)
    counts[key] = (counts[key] ?? 0) + 1
  }
  return counts
}
