// Résumé tailoring and cover-letter writing as plain functions over an injected model call, so the gates
// and the fall-backs are testable without an agent. Every call is single-shot and text-only.
import { extractJson } from '../ats/prompt'
import { humanize, type TextCall } from '../humanizer'
import type { JobPosting } from '../job-view/types'
import { aiTells, gateLetter, lostFacts, type LetterDraft } from './gate'
import { coverPrompt, resumePrompt, withProblems, type CoverInput, type ResumeInput } from './prompts'
import { applyEdits, parseEdits, type Change } from './resumeEdits'

export type Usage = { tokens: number; model: string | null }
const add = (u: Usage, r: { tokens: number | null; model: string | null }): Usage => ({ tokens: u.tokens + (r.tokens ?? 0), model: r.model ?? u.model })
const parse = (text: string): unknown => { const j = extractJson(text); if (!j) throw new Error('no JSON in the reply'); return JSON.parse(j) }

export type ResumeResult = { cv: string; changes: Change[]; usage: Usage }

export async function tailorResume(i: ResumeInput, run: TextCall): Promise<ResumeResult> {
  let usage: Usage = { tokens: 0, model: null }
  let prompt = resumePrompt(i)
  for (let attempt = 0; attempt < 2; attempt++) {
    const r = await run(prompt)
    usage = add(usage, r)
    try {
      const edits = parseEdits(parse(r.text))
      if (!edits.length) throw new Error('the reply had no edits')
      const out = applyEdits(i.cv, edits)
      if (out.changes.some(c => c.status === 'applied') || attempt === 1) return { ...out, usage }
      prompt = withProblems(resumePrompt(i), out.changes.map(c => `${c.section}: ${c.reason}`))
    } catch (e) {
      if (attempt === 1) throw new Error(`The model did not return usable edits (${(e as Error).message})`)
      prompt = withProblems(resumePrompt(i), [(e as Error).message])
    }
  }
  throw new Error('unreachable')
}

const readDraft = (raw: unknown): LetterDraft => {
  const o = (raw ?? {}) as Record<string, unknown>
  const strs = (v: unknown) => (Array.isArray(v) ? v.flatMap(x => (typeof x === 'string' && x.trim() ? [x.trim()] : [])) : [])
  const claims = (Array.isArray(o.claims) ? o.claims : []).flatMap(c => {
    const x = (c ?? {}) as Record<string, unknown>
    return typeof x.sentence === 'string' && typeof x.cv_source_quote === 'string' ? [{ sentence: x.sentence.trim(), cv_source_quote: x.cv_source_quote.trim() }] : []
  })
  const paragraphs = strs(o.paragraphs)
  if (!paragraphs.length) throw new Error('the reply had no paragraphs')
  return { paragraphs, claims, learning: strs(o.learning) }
}

export type CoverOptions = { humanize: boolean; voiceSample?: string }
export type CoverResult = { paragraphs: string[]; humanized: boolean; usage: Usage; humanizeUsage: Usage | null; notes: string[]; tells: string[] }

/** Draft -> gate -> (optional) humanizer -> gate again. A failing draft is repaired once, then refused. */
export async function writeCover(i: CoverInput & { allow: string[] }, opts: CoverOptions, write: TextCall, polish: TextCall): Promise<CoverResult> {
  let usage: Usage = { tokens: 0, model: null }
  const base = coverPrompt(i)
  let prompt = base
  let draft: LetterDraft | null = null
  let problems: string[] = []
  for (let attempt = 0; attempt < 2 && !draft; attempt++) {
    const r = await write(prompt)
    usage = add(usage, r)
    try {
      const d = readDraft(parse(r.text))
      const gate = gateLetter(d, i.cv, i.allow)
      if (gate.ok) draft = d
      else { problems = gate.violations; prompt = withProblems(base, problems) }
    } catch (e) { problems = [(e as Error).message]; prompt = withProblems(base, problems) }
  }
  if (!draft) throw new Error(`Blocked: the draft claimed things that are not in your résumé. ${problems.slice(0, 3).join(' ')}`)

  const notes: string[] = []
  let paragraphs = draft.paragraphs
  let humanizeUsage: Usage | null = null
  let humanized = false
  if (opts.humanize) {
    try {
      const h = await humanize(paragraphs.join('\n\n'), polish, { voiceSample: opts.voiceSample })
      humanizeUsage = add({ tokens: 0, model: null }, h)
      const rewritten = h.text.split(/\n{2,}/).map(p => p.trim()).filter(Boolean)
      // A rewrite can drop or add facts, so the same gate runs again; claims keep their résumé quotes but may be reworded, so only the sentence-level check applies.
      const gate = gateLetter({ paragraphs: rewritten, claims: [], learning: draft.learning }, i.cv, i.allow)
      const lost = lostFacts(paragraphs.join('\n'), rewritten.join('\n'), i.allow)
      if (gate.ok && !lost.length) { paragraphs = rewritten; humanized = true }
      else notes.push(`The humanizer pass was discarded because it changed facts: ${gate.ok ? `it dropped ${lost.join(', ')}` : gate.violations[0]}`)
    } catch (e) { notes.push(`The humanizer pass was skipped: ${(e as Error).message}`) }
  }
  return { paragraphs, humanized, usage, humanizeUsage, notes, tells: aiTells(paragraphs.join('\n')) }
}

export type { JobPosting }
