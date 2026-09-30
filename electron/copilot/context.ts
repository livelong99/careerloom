// Grounding for answers (plan §3.4): a stable, cacheable prefix built from the posting, the evaluation report, the
// interview plan's STAR stories and cv.md verbatim; plus the rolling transcript window.
// Transcript-window budgeting is ported from Open-Cluely (owner's project), adapted for Careerloom:
// renderer/features/ai-context/context-bundle.js (newest-first under a budget, per-line AI on/off).
import type { JobPosting, ReportBlock, ReportView } from '../job-view/types'
import type { ContextPreview, ContextSummary, TranscriptLine } from './types'

export type Story = { requirement: string; title: string; s: string; t: string; a: string; r: string }
export type JobSource = { jobId: string; title: string; company: string; report: ReportView | null; rawReport: string | null; posting: JobPosting | null }
export type ContextDeps = {
  loadJob(jobId: string): Promise<JobSource | null> | JobSource | null
  readCv(): Promise<string | null> | string | null
}
export type GroundingContext = {
  prefix: string; tokens: number; summary: ContextSummary
  /** cv.md verbatim: the guard's ground truth for facts and proof quotes. */
  cv: string
  /** The STAR stories in the exact text used inside `prefix`, so proof quotes can be checked against them. */
  storiesText: string
  /** Names the answer may repeat without inventing them (company, role, tech in the posting). */
  known: string[]
  counts: Omit<ContextPreview, 'tokens' | 'text'>
}
export interface ContextBuilder {
  build(jobId: string): Promise<GroundingContext>
  preview(jobId: string): Promise<ContextPreview>
  window(lines: TranscriptLine[], budgetTokens: number, opts?: { maxLines?: number; exclude?: ReadonlySet<string> }): TranscriptLine[]
}

export const estimateTokens = (text: string) => Math.ceil(text.length / 4)
const MAX_PREFIX_TOKENS = 6000
const cap = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)
const clean = (s: string) => s.replace(/\*\*|__|`/g, '').replace(/\s+/g, ' ').trim()

// ————— Interview plan —————
const COL = { req: /requirement|anforderung/i, story: /story|title|geschichte/i, s: /^s$|situation/i, t: /^t$|task|aufgabe/i, a: /^a$|action|aktion/i, r: /^r$|result|ergebnis/i }
const colIndex = (headers: string[], re: RegExp) => headers.findIndex(h => re.test(clean(h)))

function storiesFromTable(headers: string[], rows: string[][]): Story[] {
  const [q, st, s, t, a, r] = [COL.req, COL.story, COL.s, COL.t, COL.a, COL.r].map(re => colIndex(headers, re))
  if (st < 0 || s < 0 || a < 0) return []
  const at = (row: string[], i: number) => (i >= 0 ? clean(row[i] ?? '') : '')
  return rows.map(row => ({ requirement: at(row, q), title: at(row, st), s: at(row, s), t: at(row, t), a: at(row, a), r: at(row, r) })).filter(x => x.title || x.s)
}

/** Stories from the parsed report's interview section. */
export function storiesFromReport(report: ReportView | null): Story[] {
  const sec = report?.sections.find(x => x.kind === 'interview')
  if (!sec) return []
  return sec.blocks.filter((b): b is Extract<ReportBlock, { kind: 'table' }> => b.kind === 'table').flatMap(b => storiesFromTable(b.headers, b.rows))
}

/** Fallback when the parser found no interview section: heading splitter `^## F)` (plan §2) over the raw markdown. */
export function storiesFromMarkdown(raw: string | null): Story[] {
  if (!raw) return []
  const sec = /^##\s+F\)[^\n]*\n([\s\S]*?)(?=^##\s|\s*$(?![\s\S]))/m.exec(raw)?.[1] ?? /^##\s+[^\n]*interview[^\n]*\n([\s\S]*?)(?=^##\s|(?![\s\S]))/im.exec(raw)?.[1]
  if (!sec) return []
  const cells = (l: string) => l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
  const rows = sec.split('\n').filter(l => l.trim().startsWith('|'))
  const head = rows.findIndex(l => /story/i.test(l))
  if (head < 0) return []
  return storiesFromTable(cells(rows[head]!), rows.slice(head + 2).map(cells))
}

export const storiesText = (stories: Story[]): string =>
  stories.map((x, i) => [`Story ${i + 1}${x.requirement ? ` (for: ${x.requirement})` : ''}: ${x.title}`, x.s && `S: ${x.s}`, x.t && `T: ${x.t}`, x.a && `A: ${x.a}`, x.r && `R: ${x.r}`].filter(Boolean).join('\n')).join('\n\n')

// ————— cv.md facts —————
/** cv.md as a compact verbatim list: headings and lines kept as written (so quotes stay substrings), blanks and comments dropped. */
export function cvFacts(cv: string): string[] {
  return cv.replace(/<!--[\s\S]*?-->/g, '').split('\n').map(l => l.replace(/\s+$/, '')).filter(l => l.trim() && !/^[-=_*]{3,}$/.test(l.trim()))
}
const isFact = (l: string) => /^\s*(?:[-*•]|\d+[.)])\s+\S/.test(l)

// ————— Grounding prefix —————
function postingSection(p: JobPosting | null, title: string, company: string): { text: string; count: number } {
  const head = `Role: ${p?.title || title || 'unknown'} at ${p?.company || company || 'unknown'}${p?.location ? ` (${p.location})` : ''}${p?.seniority ? `, ${p.seniority}` : ''}`
  if (!p) return { text: head, count: 0 }
  const reqs = [...p.requirements.required, ...p.requirements.preferred.map(x => `${x} (preferred)`)]
  const lines = [head, p.summary && `Summary: ${cap(clean(p.summary), 500)}`, reqs.length && `Requirements:\n${reqs.slice(0, 12).map(x => `- ${cap(clean(x), 160)}`).join('\n')}`,
    p.responsibilities.length && `Responsibilities:\n${p.responsibilities.slice(0, 8).map(x => `- ${cap(clean(x), 160)}`).join('\n')}`,
    p.techStack.length && `Tech: ${p.techStack.slice(0, 25).join(', ')}`, p.skills.length && `Themes: ${p.skills.slice(0, 12).join(', ')}`].filter(Boolean)
  return { text: lines.join('\n'), count: reqs.length + p.responsibilities.length }
}

function evalSection(r: ReportView | null): { text: string; strengths: number; gaps: number } {
  if (!r) return { text: '', strengths: 0, gaps: 0 }
  const strengths = r.topStrengths.map(clean).filter(Boolean)
  const gaps = r.gaps.length ? r.gaps.map(g => `- ${clean(g.title).replace(/:$/, '')}${g.mitigation ? ` | if asked: ${cap(clean(g.mitigation), 200)}` : ''}`) : r.softGaps.map(g => `- ${clean(g)}`)
  const text = [strengths.length && `Strengths to lean on:\n${strengths.map(x => `- ${x}`).join('\n')}`, gaps.length && `Known gaps (be honest, never claim these):\n${gaps.join('\n')}`].filter(Boolean).join('\n\n')
  return { text, strengths: strengths.length, gaps: gaps.length }
}

export function buildGrounding(job: JobSource, cv: string | null): GroundingContext {
  const posting = postingSection(job.posting, job.title, job.company)
  const ev = evalSection(job.report)
  const stories = (() => { const a = storiesFromReport(job.report); return a.length ? a : storiesFromMarkdown(job.rawReport) })()
  const sText = storiesText(stories)
  const cvText = cv ?? ''
  let facts = cvFacts(cvText)
  const assemble = (f: string[]) => [
    `## JOB\n${posting.text}`, ev.text && `## EVALUATION\n${ev.text}`, sText && `## INTERVIEW PLAN — STAR STORIES (prepared, true)\n${sText}`,
    `## CANDIDATE FACTS (cv.md, verbatim — the only source of truth about the candidate)\n${f.length ? f.join('\n') : '(no résumé on file: say so and ask the candidate for specifics; invent nothing)'}`,
  ].filter(Boolean).join('\n\n')
  let prefix = assemble(facts)
  // Over budget: drop the tail of cv.md (oldest roles, education) rather than the job or the prepared stories.
  while (estimateTokens(prefix) > MAX_PREFIX_TOKENS && facts.length > 10) { facts = facts.slice(0, Math.floor(facts.length * 0.85)); prefix = assemble(facts) }
  const known = [job.title, job.company, job.posting?.title, job.posting?.company, ...(job.posting?.techStack ?? []), ...(job.posting?.skills ?? []), ...(job.report?.keywords ?? [])].filter((x): x is string => !!x)
  return {
    prefix, tokens: estimateTokens(prefix), cv: cvText, storiesText: sText, known,
    summary: { jobId: job.jobId, title: job.title, company: job.company, hasPosting: !!job.posting, hasReport: !!job.report, hasCv: !!cv, stories: stories.length },
    counts: { posting: posting.count, strengths: ev.strengths, gaps: ev.gaps, facts: facts.filter(isFact).length, stories: stories.length },
  }
}

// ————— Transcript window —————
export function windowLines(lines: TranscriptLine[], budgetTokens: number, opts: { maxLines?: number; exclude?: ReadonlySet<string> } = {}): TranscriptLine[] {
  const out: TranscriptLine[] = []
  let used = 0
  for (let i = lines.length - 1; i >= 0 && out.length < (opts.maxLines ?? 12); i--) {
    const l = lines[i]!
    if (!l.text.trim() || opts.exclude?.has(l.id)) continue
    const cost = estimateTokens(l.text) + 4
    if (used + cost > budgetTokens) break
    used += cost
    out.push(l)
  }
  return out.reverse()
}

export function createContextBuilder(deps: ContextDeps): ContextBuilder {
  const load = async (jobId: string) => {
    const job = await deps.loadJob(jobId)
    if (!job) throw new Error('That job is no longer in your list')
    return buildGrounding(job, (await deps.readCv()) ?? null)
  }
  return {
    build: load,
    async preview(jobId) { const g = await load(jobId); return { tokens: g.tokens, text: g.prefix, ...g.counts } },
    window: windowLines,
  }
}

/** The real loaders (job list, parsed report, cached posting, cv.md). Lazy imports keep Electron out of unit tests. */
export function defaultContextDeps(): ContextDeps {
  return {
    async loadJob(jobId) {
      const { jobContext } = await import('../job-view/handlers.js')
      const { readReport } = await import('../careerops.js')
      const { dataRoot } = await import('../context.js')
      const c = jobContext(jobId)
      let rawReport: string | null = null
      if (c.job.reportPath) { try { rawReport = readReport(dataRoot(), c.job.reportPath) } catch { rawReport = null } }
      return { jobId, title: c.job.title, company: c.job.company, report: c.report, rawReport, posting: c.posting }
    },
    async readCv() { try { return (await import('../resume-agent.js')).readCv()?.markdown ?? null } catch { return null } },
  }
}
