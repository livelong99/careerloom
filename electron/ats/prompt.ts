// The one agent run per analysis: a lean prompt, a strict JSON shape, tolerant validation. Pure.
import type { ApplyOp, AtsAnswer, AtsCategory, AtsFinding, AtsQuestion, AtsSeverity } from '../contract'
import type { BulletNote } from './bullets'
import { readExtraction, stripScores, type LlmExtraction } from './llm'

export const MAX_ROUNDS = 3
export const MAX_QUESTIONS = 5
const JD_CAP = 12_000

export type AgentOutput = {
  status: 'needs_input' | 'done'
  extraction: LlmExtraction
  findings: AtsFinding[]
  skillHints: Record<string, string>
  courses: unknown[]
  plan?: string
  questions: AtsQuestion[]
}

const SHAPE = `{"status":"done|needs_input",
"jd":{"requirements":[{"id":"r1","text":"short JD quote","skill":"canonical skill","required":true,"years":5}]},
"judgements":[{"req_id":"r1","match":"exact|synonym|taxonomy|none","cv_quote":"verbatim from cv.md","certain":true}],
"bullet_notes":[{"line":12,"specific":true,"quote":"verbatim words from that line"}],
"findings":[{"id":"f1","severity":"critical|major|minor|info","category":"keyword|evidence|bullet|skill|seniority|section|date","title":"","detail":"why it matters, 1-3 sentences","evidence":"quote","apply":{"op":"replace|insert|append|delete","target":"EXACT text from cv.md","after":"new text, may use {{q1}}","requires_answers":["q1"]}}],
"skill_gaps":[{"skill":"","howToAdd":"2-3 concrete sentences: what to build or learn and how to show it"}],
"courses":[{"title":"","provider":"","url":"","free":true,"hours":10,"skill":"","why":""}],
"plan":"markdown learning plan, timeboxed, free resources first",
"questions":[{"id":"q1","finding_id":"f1","text":"","type":"text|choice|number","options":[],"why":""}]}`

const RULES = `Rules:
- Never output any score or overall verdict; code computes them.
- requirements: every distinct JD requirement (required vs preferred), at most 25. judgements: only where cv.md uses a different word for the same thing, or you are unsure; cv_quote must be verbatim.
- findings: concrete and specific, highest impact first. A rewrite may only rephrase facts in cv.md or facts in the user's answers; if it needs a fact you lack (a number, a tool, scope), ask a question and use {{qid}} in "after" instead of inventing it. apply.target must be copied exactly from cv.md and occur once.
- skill_gaps: every JD skill cv.md lacks.
- questions: at most ${MAX_QUESTIONS} in total and only when needed; set status needs_input only when a question blocks a finding.`

const COURSES_ON = '- courses: only from web search; real URLs you opened; free first (MIT OpenCourseWare, freeCodeCamp, roadmap.sh, Hugging Face courses) then paid; never invent one; [] if none.'
const COURSES_OFF = '- courses: leave [] (this runner cannot search the web); plan may name topics but no URLs.'

export const numbered = (cv: string) => cv.split('\n').map((l, i) => `${i + 1}: ${l}`).join('\n')

export type PromptInput = { cv: string; jd: string; outPath: string; canSearch: boolean; answers?: AtsAnswer[]; partial?: string; finalRound?: boolean }

export function buildPrompt(p: PromptInput): string {
  const answers = p.answers?.length ? `\nThe user answered your questions:\n${p.answers.map(a => `- ${a.id}: ${a.value}`).join('\n')}\n` : ''
  const partial = p.partial ? `\nYour earlier partial result (continue from it, do not start over):\n${p.partial.slice(0, 6000)}\n` : ''
  const last = p.finalRound ? '\nThis is the last round: ask no more questions, use the answers you have, set status "done".\n' : ''
  return `Careerloom ATS analysis (headless task from the app; do not ask for confirmation).
Compare the résumé with the job description and write ONE JSON object (no prose) to ${p.outPath}, shaped:
${SHAPE}
${RULES}
${p.canSearch ? COURSES_ON : COURSES_OFF}
${answers}${partial}${last}
<cv.md lines>
${numbered(p.cv)}
</cv.md>
<job-description>
${p.jd.slice(0, JD_CAP)}
</job-description>`
}

export const resumePrompt = (answers: AtsAnswer[], outPath: string, finalRound: boolean) =>
  `The user answered:\n${answers.map(a => `- ${a.id}: ${a.value}`).join('\n')}\n${finalRound ? 'This is the last round: ask no more questions, set status "done". ' : ''}Continue and rewrite the complete JSON object to ${outPath} (same shape, no prose).`

export const repairPrompt = (errors: string[], outPath: string) =>
  `The JSON you wrote to ${outPath} failed validation:\n${errors.slice(0, 6).map(e => `- ${e}`).join('\n')}\nRewrite the complete, corrected JSON object to that file (same shape, no prose).`

/** First balanced {...} in free text (an agent that printed instead of writing the file). */
export function extractJson(text: string): string | null {
  const fence = /```(?:json)?\s*([\s\S]*?)```/.exec(text)?.[1]
  const src = fence && fence.includes('{') ? fence : text
  const start = src.indexOf('{')
  for (let end = src.lastIndexOf('}'); start >= 0 && end > start; end = src.lastIndexOf('}', end - 1)) {
    const cand = src.slice(start, end + 1)
    try { JSON.parse(cand); return cand } catch { /* try a shorter tail */ }
  }
  return null
}

const SEV = new Set(['critical', 'major', 'minor', 'info'])
const CAT = new Set(['parse', 'keyword', 'evidence', 'bullet', 'date', 'section', 'seniority', 'skill'])
const OPS = new Set(['replace', 'insert', 'append', 'delete'])
const QTYPE = new Set(['text', 'choice', 'number'])
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : [])
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {})

function readApply(raw: unknown): ApplyOp | undefined {
  const o = obj(raw)
  const op = str(o.op)
  if (!OPS.has(op) || (!str(o.target) && op !== 'append') || (typeof o.after !== 'string' && op !== 'delete')) return undefined
  return { op: op as ApplyOp['op'], target: str(o.target), before: str(o.before) || undefined, after: typeof o.after === 'string' ? o.after : '', requires_answers: arr(o.requires_answers).map(str).filter(Boolean) }
}

/** Parse + validate the agent's JSON. Errors (for one repair retry) only for structural faults; junk entries are dropped. */
export function validateAgentOutput(text: string, opts: { needJd: boolean }): { ok: true; out: AgentOutput } | { ok: false; errors: string[] } {
  let raw: unknown
  try { raw = JSON.parse(text) } catch (e) { return { ok: false, errors: [`not valid JSON: ${(e as Error).message}`] } }
  const r = stripScores(obj(raw))
  const errors: string[] = []
  const status = str(r.status)
  if (status !== 'done' && status !== 'needs_input') errors.push('"status" must be "done" or "needs_input"')
  const extraction = readExtraction(r)
  if (opts.needJd && status === 'done' && extraction.reqs.length === 0) errors.push('"jd.requirements" is empty: list every requirement from the job description')
  const questions = arr(r.questions).flatMap((x): AtsQuestion[] => {
    const o = obj(x)
    const id = str(o.id), text = str(o.text)
    if (!id || !text) return []
    const options = arr(o.options).map(str).filter(Boolean)
    const type = QTYPE.has(str(o.type)) ? str(o.type) as AtsQuestion['type'] : options.length ? 'choice' : 'text'
    return [{ id, finding_id: str(o.finding_id) || undefined, text, type, options: options.length ? options : undefined, why: str(o.why) }]
  }).slice(0, MAX_QUESTIONS)
  if (status === 'needs_input' && questions.length === 0) errors.push('status is "needs_input" but "questions" is empty')
  const findings = arr(r.findings).flatMap((x, i): AtsFinding[] => {
    const o = obj(x)
    const title = str(o.title)
    if (!title) return []
    return [{
      id: str(o.id) || `f${i + 1}`, title, detail: str(o.detail),
      severity: (SEV.has(str(o.severity)) ? str(o.severity) : 'minor') as AtsSeverity,
      category: (CAT.has(str(o.category)) ? str(o.category) : 'keyword') as AtsCategory,
      evidence: str(o.evidence) || undefined, apply: readApply(o.apply), status: 'open',
    }]
  })
  const skillHints = Object.fromEntries(arr(r.skill_gaps).flatMap((x): Array<[string, string]> => { const o = obj(x); return str(o.skill) ? [[str(o.skill).toLowerCase(), str(o.howToAdd)]] : [] }))
  if (errors.length) return { ok: false, errors }
  return { ok: true, out: { status: status as AgentOutput['status'], extraction, findings, skillHints, courses: arr(r.courses), plan: str(r.plan) || undefined, questions } }
}

export type { BulletNote }
