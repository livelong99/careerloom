// Analysis lifecycle: hash → cache | local parse (~1 s) → one agent run (+ answer rounds, one repair) → code scores → report.
// Everything impure comes in through `Deps`, so the flow is unit-tested with a fake agent.
import type { AtsAnalyzeInput, AtsAnswer, AtsEvent, AtsFinding, AtsReport } from '../contract'
import { bulletFindings, evidenceFindings, mergeFindings, parseFindings, seniorityFinding, skillFindings, skillGaps } from './findings'
import { verifyCourses, type Fetcher } from './courses'
import { similarities, type SimCall } from './embed'
import type { LlmExtraction } from './llm'
import { scoreMatch, type MatchResult } from './match'
import { parseCv } from './model'
import { scoreParseHealth } from './parseHealth'
import { buildPrompt, extractJson, MAX_QUESTIONS, MAX_ROUNDS, repairPrompt, resumePrompt, validateAgentOutput, type AgentOutput } from './prompt'
import { ENGINE_VERSION, sha, type Analysis, type Store } from './store'
import type { PdfPage } from './types'

export type AgentRun = { status: string; log: string; sessionId: string | null }
export type Deps = {
  store: Store
  now(): number
  newId(): string
  readCv(): string | null
  writeCv(md: string): void
  render(templateId: string): Promise<{ pdf: Uint8Array | null; html: string | null }>
  pages(pdf: Uint8Array): Promise<PdfPage[]>
  runner(): string
  /** Starts the run; throws when no agent is configured. */
  startAgent(prompt: string, o: { resume?: string; onExit: (r: AgentRun) => void }): void
  sim: SimCall | null
  fetcher: Fetcher
  emit(e: AtsEvent): void
  rebuildProfile(md: string): boolean
  defaultTemplate(): string
}

const RESUMABLE = new Set(['claude', 'antigravity', 'opencode', 'zen']) // codex cannot resume: it is re-run statelessly
const SEARCHERS = new Set(['claude', 'antigravity']) // runners whose agent can web-search for courses
export const canSearch = (runner: string) => SEARCHERS.has(runner)
const evidenceBullets = (cv: string) => parseCv(cv).bullets.filter(b => b.evidence).map(b => b.text)

// ————— Scoring (code only) —————

type Built = { report: AtsReport; match: MatchResult | null }

export async function buildReport(deps: Deps, a: Pick<Analysis, 'id' | 'createdAt' | 'templateId' | 'jd' | 'extraction' | 'agentFindings' | 'hints' | 'courses' | 'plan' | 'notes' | 'session' | 'key'>, cv: string, prior: AtsFinding[] = []): Promise<Built> {
  const model = parseCv(cv)
  let pages: PdfPage[] | null = null
  let html: string | null = null
  const notes = [...a.notes]
  try {
    const r = await deps.render(a.templateId)
    html = r.html
    pages = r.pdf ? await deps.pages(r.pdf) : null
  } catch (e) { notes.push(`Could not render the template, so the PDF checks were estimated: ${(e as Error).message.split('\n')[0]}`) }
  const parse = scoreParseHealth({ cv: model, pages, html, now: deps.now() })

  let match: MatchResult | null = null
  const reqs = a.extraction?.reqs ?? []
  if (a.jd && reqs.length) {
    const sims = await similarities(reqs, evidenceBullets(cv), deps.sim)
    match = scoreMatch({ cv: model, reqs, judgements: a.extraction?.judgements, notes: a.extraction?.notes, similarities: sims, jdText: a.jd, now: deps.now() })
    if (match.degraded.embeddings) notes.push('Install the local model for a more accurate job match: the meaning-based part is left out, so the score is marked lower confidence.')
  }
  const gaps = match ? skillGaps(match.perReq, a.hints) : []
  const findings = mergeFindings(
    [...parseFindings(parse.issues), ...bulletFindings(match?.weakBullets ?? []), ...(match ? [...evidenceFindings(match.perReq), ...seniorityFinding(match.yearsHave, match.yearsNeed), ...skillFindings(gaps)] : [])],
    a.agentFindings, cv, prior,
  )
  const { perReq: _p, degraded: _d, yearsHave: _y, yearsNeed: _n, weakBullets: _w, ...matchBlock } = match ?? ({} as Partial<MatchResult>)
  const { issues: _i, degraded: _pd, dates: _dt, ...parseBlock } = parse
  const report: AtsReport = {
    id: a.id, createdAt: a.createdAt, label: 'parse-risk heuristic',
    hashes: { cv: sha(cv), jd: a.jd ? sha(a.jd) : undefined, tpl: sha(`${a.templateId}:${html ?? ''}`) },
    parse: parseBlock, ...(match ? { match: matchBlock as AtsReport['match'] } : {}),
    degraded: { embeddings: !!match?.degraded.embeddings, pdfText: parse.degraded.pdfText },
    findings, skillGaps: gaps, courses: a.courses, plan: a.plan, ...(notes.length ? { notes } : {}),
    ...(a.session && a.session.questions.length ? { session: { runId: a.id, sessionId: a.session.sessionId, round: a.session.round, questions: a.session.questions } } : {}),
  }
  return { report, match }
}

const save = async (deps: Deps, a: Analysis, cv: string): Promise<Analysis> => {
  const { report } = await buildReport(deps, a, cv, a.report?.findings)
  const next = { ...a, report }
  deps.store.save(next)
  return next
}

// ————— Start —————

export async function startAnalysis(deps: Deps, input: AtsAnalyzeInput): Promise<{ runId: string }> {
  const cv = deps.readCv()
  if (!cv) throw new Error('No résumé yet: add one and extract it first')
  const jd = (input.jd ?? '').trim()
  if (!jd && input.jobId) throw new Error('Paste the job description to analyse against')
  const templateId = input.templateId || deps.defaultTemplate()
  const key = sha([sha(cv), sha(jd), templateId, ENGINE_VERSION].join('|'))
  const cached = deps.store.cacheGet(key)
  const id = deps.newId()
  if (cached) {
    deps.store.save({ ...cached, id, createdAt: deps.now(), report: { ...cached.report, id, createdAt: deps.now() } })
    deps.emit({ runId: id, phase: 'done', message: 'Loaded the saved analysis for this résumé and job' })
    return { runId: id }
  }
  const a: Analysis = { id, createdAt: deps.now(), templateId, jd, key, extraction: null, agentFindings: [], hints: {}, courses: [], notes: [], report: undefined as never }
  deps.emit({ runId: id, phase: 'parse', message: 'Reading your résumé as a parser would' })
  const first = await save(deps, a, cv) // parse health lands in about a second
  if (!jd) {
    deps.store.cachePut(first)
    deps.emit({ runId: id, phase: 'done', message: 'Checked parse health and bullets. Add a job description for skill gaps and courses.' })
    return { runId: id }
  }
  const session = { runner: deps.runner(), sessionId: null, round: 1, asked: 0, questions: [], answers: [] }
  try {
    launch(deps, { ...first, session }, buildPrompt({ cv, jd, canSearch: canSearch(session.runner) }))
  } catch (e) {
    await finishLocal(deps, { ...first, session }, cv, (e as Error).message)
    return { runId: id }
  }
  deps.emit({ runId: id, phase: 'agent', message: 'The agent is reading the job description' })
  return { runId: id }
}

function launch(deps: Deps, a: Analysis, prompt: string, resume?: string): void {
  deps.store.save(a)
  deps.startAgent(prompt, { resume, onExit: r => { void afterRun(deps, a.id, r).catch(err => failed(deps, a.id, err)) } })
}

async function failed(deps: Deps, id: string, err: unknown): Promise<void> {
  const a = deps.store.current()
  const cv = deps.readCv()
  if (a?.id === id && cv) await finishLocal(deps, a, cv, (err as Error).message)
}

/** The agent is unavailable or unreadable: keep the local checks and say so. */
async function finishLocal(deps: Deps, a: Analysis, cv: string, why: string): Promise<void> {
  const next = await save(deps, { ...a, notes: [...a.notes, `The agent part was skipped: ${why.split('\n')[0]}`], session: undefined }, cv)
  void next
  deps.emit({ runId: a.id, phase: 'done', message: `Local checks done. ${why.split('\n')[0]}` })
}

// ————— After a run —————

async function afterRun(deps: Deps, id: string, run: AgentRun): Promise<void> {
  const a = deps.store.current()
  const cv = deps.readCv()
  if (!a || a.id !== id || !a.session || !cv) return
  const session = { ...a.session, sessionId: run.sessionId ?? a.session.sessionId }
  if (run.status !== 'done') return finishLocal(deps, { ...a, session }, cv, `The agent run ${run.status}`)
  const text = extractJson(run.log)
  const v = text ? validateAgentOutput(text, { needJd: !!a.jd }) : { ok: false as const, errors: ['no JSON object was found in your reply'] }
  if (!v.ok) {
    if (session.repaired) return finishLocal(deps, { ...a, session }, cv, 'The agent did not return a readable result')
    deps.emit({ runId: id, phase: 'agent', message: 'Asking the agent to fix its answer' })
    const next = { ...a, session: { ...session, repaired: true } }
    const resume = RESUMABLE.has(session.runner) && session.sessionId ? session.sessionId : undefined
    return launch(deps, next, resume ? repairPrompt(v.errors) : buildPrompt({ cv, jd: a.jd, canSearch: canSearch(session.runner), partial: `Validation errors to fix: ${v.errors.join('; ')}` }), resume)
  }
  const out = v.out
  const asked = session.asked + out.questions.length
  if (out.status === 'needs_input' && session.round < MAX_ROUNDS && asked <= MAX_QUESTIONS) {
    const next = await save(deps, { ...a, session: { ...session, asked, questions: out.questions, partial: text!.slice(0, 8000) }, extraction: out.extraction, agentFindings: out.findings }, cv)
    deps.emit({ runId: id, phase: 'agent', message: `The agent needs ${out.questions.length} answer${out.questions.length > 1 ? 's' : ''} to continue`, questions: out.questions })
    void next
    return
  }
  await finalize(deps, { ...a, session }, out, cv)
}

async function finalize(deps: Deps, a: Analysis, out: AgentOutput, cv: string): Promise<void> {
  deps.emit({ runId: a.id, phase: 'score', message: 'Scoring' })
  const notes = [...a.notes]
  let courses = a.courses
  if (!canSearch(a.session?.runner ?? deps.runner())) {
    notes.push('Course search needs a runner that can search the web (Claude Code or Antigravity), so no courses are shown.')
    courses = []
  } else if (out.courses.length) {
    const v = await verifyCourses(out.courses, deps.fetcher, deps.now())
    courses = v.courses
    if (v.dropped.length) notes.push(`${v.dropped.length} suggested course link${v.dropped.length > 1 ? 's were' : ' was'} dropped because the page did not load.`)
  }
  const next = await save(deps, { ...a, extraction: out.extraction, agentFindings: out.findings, hints: out.skillHints, courses, plan: out.plan, notes, session: undefined }, cv)
  deps.store.cachePut(next)
  deps.emit({ runId: a.id, phase: 'done', message: 'Analysis ready' })
}

// ————— Answers —————

export async function answerAnalysis(deps: Deps, runId: string, answers: AtsAnswer[]): Promise<{ runId: string }> {
  const a = deps.store.current()
  const cv = deps.readCv()
  if (!a || a.id !== runId || !a.session || !cv) throw new Error('There is no analysis waiting for answers')
  const s = a.session
  const all = [...s.answers, ...answers]
  const round = s.round + 1
  const finalRound = round >= MAX_ROUNDS || s.asked >= MAX_QUESTIONS
  const runner = deps.runner()
  const resume = RESUMABLE.has(runner) && runner === s.runner && s.sessionId ? s.sessionId : undefined
  const prompt = resume
    ? resumePrompt(answers, finalRound)
    // Stateless path (codex, or a different runner than the one that asked): everything is re-sent with the answers injected.
    : buildPrompt({ cv, jd: a.jd, canSearch: canSearch(runner), answers: all, partial: s.partial, finalRound })
  deps.emit({ runId, phase: 'agent', message: 'The agent is using your answers' })
  launch(deps, { ...a, session: { ...s, runner, round, answers: all, questions: [] } }, prompt, resume)
  return { runId }
}
