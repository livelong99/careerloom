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
      console.error('tailor résumé: unusable reply:', r.text.slice(-500))
      if (attempt === 1) throw new Error(`The model did not return usable edits (${(e as Error).message})`)
      prompt = withProblems(resumePrompt(i), [(e as Error).message])
    }
  }
  throw new Error('unreachable')
}

// Tolerant of a missing closing tag: the block ends at its close, the next tag, or the end of the reply.
const tag = (text: string, name: string): string | null => [...text.matchAll(new RegExp(`<${name}>([\\s\\S]*?)(?:</${name}>|<(?:letter|claims|learning)>|$)`, 'g'))].at(-1)?.[1]?.trim() || null

/** JSON drift: some models answer the tagged format with a JSON object, sometimes with "sentence ||| quote" strings and a string `learning`. */
function readJsonDraft(text: string): LetterDraft | null {
  const j = extractJson(text)
  if (!j) return null
  const o = JSON.parse(j) as Record<string, unknown>
  const strs = (v: unknown): string[] => (Array.isArray(v) ? v : typeof v === 'string' ? v.split(',') : []).flatMap(x => (typeof x === 'string' && x.trim() ? [x.trim()] : []))
  const paragraphs = Array.isArray(o.paragraphs) ? strs(o.paragraphs) : typeof o.letter === 'string' ? o.letter.split(/\n{2,}/).map(p => p.trim()).filter(Boolean) : []
  if (!paragraphs.length) return null
  const claims = (Array.isArray(o.claims) ? o.claims : []).flatMap(c => {
    if (typeof c === 'string') { const [sentence, quote] = c.split('|||').map(x => x.trim()); return sentence && quote ? [{ sentence, cv_source_quote: quote }] : [] }
    const x = (c ?? {}) as Record<string, unknown>
    return typeof x.sentence === 'string' && typeof x.cv_source_quote === 'string' ? [{ sentence: x.sentence.trim(), cv_source_quote: x.cv_source_quote.trim() }] : []
  })
  return { paragraphs, claims, learning: strs(o.learning) }
}

/** The tagged draft format (JSON is accepted too): prose survives quotes and line breaks that break JSON strings. */
export function readDraft(text: string): LetterDraft {
  const letter = tag(text, 'letter')
  if (!letter) {
    try { const d = readJsonDraft(text); if (d) return d } catch { /* fall through to the error */ }
    throw new Error('the reply had no <letter> block')
  }
  const paragraphs = letter.split(/\n{2,}/).map(p => p.replace(/\s*\n\s*/g, ' ').trim()).filter(Boolean)
  if (!paragraphs.length) throw new Error('the letter was empty')
  const claims = (tag(text, 'claims') ?? '').split('\n').flatMap(l => {
    const [sentence, quote] = l.split('|||').map(x => x.trim())
    return sentence && quote ? [{ sentence, cv_source_quote: quote }] : []
  })
  const learning = (tag(text, 'learning') ?? '').split(',').map(x => x.trim()).filter(Boolean)
  return { paragraphs, claims, learning }
}

export type CoverOptions = { humanize: boolean; voiceSample?: string }
export type CoverResult = { paragraphs: string[]; /** The gated draft before the humanizer pass, and the AI tells it had. */ draftParagraphs: string[]; tellsBefore: string[]; humanized: boolean; usage: Usage; humanizeUsage: Usage | null; notes: string[]; tells: string[] }

/** Draft -> gate -> (optional) humanizer -> gate again. A failing draft is repaired once, then refused. */
export async function writeCover(i: CoverInput & { allow: string[] }, opts: CoverOptions, write: TextCall, polish: TextCall): Promise<CoverResult> {
  let usage: Usage = { tokens: 0, model: null }
  const base = coverPrompt(i)
  let prompt = base
  let draft: LetterDraft | null = null
  let problems: string[] = []
  let gateFailed = false
  for (let attempt = 0; attempt < 2 && !draft; attempt++) {
    const r = await write(prompt)
    usage = add(usage, r)
    try {
      if (!r.text.trim()) throw new Error('EMPTY')
      const d = readDraft(r.text)
      const gate = gateLetter(d, i.cv, i.allow)
      if (gate.ok) draft = d
      else { problems = gate.violations; gateFailed = true; prompt = withProblems(base, problems) }
    } catch (e) { console.error('cover letter: unusable reply:', r.text.slice(-500)); problems = [(e as Error).message]; gateFailed = false; prompt = withProblems(base, problems) }
  }
  if (!draft) {
    if (gateFailed) throw new Error(`Blocked: the draft claimed things that are not in your résumé. ${problems.slice(0, 3).join(' ')}`)
    if (problems[0] === 'EMPTY') throw new Error('The model used its whole output budget thinking and returned no letter. Free reasoning models often do this: pick a faster model in Settings (the main model writes the letter) and try again.')
    throw new Error('The model did not return a readable letter. Try again, or pick a different model in Settings.')
  }

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
  return { paragraphs, draftParagraphs: draft.paragraphs, tellsBefore: aiTells(draft.paragraphs.join('\n')), humanized, usage, humanizeUsage, notes, tells: aiTells(paragraphs.join('\n')) }
}

export type { JobPosting }
