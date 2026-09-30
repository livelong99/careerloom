// The fact gate for generated documents: every number, employer, name and tool in the output must already be in
// cv.md (or be the job's own company/title/location). Reuses the ATS Apply gate; sentence by sentence for prose.
import { factCheck, type FactCheck } from '../ats/factCheck'
import { extractSkills } from '../ats/skills'

export type Claim = { sentence: string; cv_source_quote: string }
export type LetterDraft = { paragraphs: string[]; claims: Claim[]; learning: string[] }

const norm = (s: string) => s.toLowerCase().replace(/[\s*_`>#\-–—•]+/g, ' ').trim()
/** A quote counts when it is a real stretch of the résumé (8+ chars, whitespace/markdown-insensitive). */
export const inCv = (quote: string, cv: string): boolean => norm(quote).length >= 8 && norm(cv).includes(norm(quote))
export const sentences = (text: string): string[] => text.split(/(?<=[.!?])\s+|\n+/).map(s => s.trim()).filter(Boolean)

const LEARNING = /\b(learn|learning|keen|interest|interested|eager|pick(?:ing)? up|build (?:more )?depth|grow|develop(?:ing)?|new to|not yet|have not|haven't|exposure)\b/i
const skillOf = (v: string) => /The skill "([^"]+)"/.exec(v)?.[1] ?? null

/** `allow`: text that is fine to mention though it is not in the résumé (the job's company, title, location). */
export function gateLetter(draft: LetterDraft, cv: string, allow: string[]): FactCheck {
  const violations: string[] = []
  const learning = new Set(draft.learning.map(s => s.toLowerCase()))
  for (const s of sentences(draft.paragraphs.join('\n'))) {
    const r = factCheck(cv, s, allow)
    for (const v of r.violations) {
      const skill = skillOf(v)
      // A skill the résumé lacks may appear only as honest interest, in a sentence that says so.
      if (skill && learning.has(skill.toLowerCase()) && LEARNING.test(s)) continue
      violations.push(`${v} (in: "${s.slice(0, 80)}")`)
    }
  }
  const text = norm(draft.paragraphs.join(' '))
  for (const c of draft.claims) {
    if (!inCv(c.cv_source_quote, cv)) violations.push(`No source in your résumé for: "${c.sentence.slice(0, 80)}"`)
    else if (!text.includes(norm(c.sentence))) violations.push(`A claim is not in the letter text: "${c.sentence.slice(0, 80)}"`)
  }
  return { ok: violations.length === 0, violations: [...new Set(violations)] }
}

const TELLS: Array<[RegExp, string]> = [
  [/[—–]/, 'dashes used as punctuation'],
  [/\b(?:i am|i'm) (?:excited|thrilled|delighted|passionate)\b/i, '"I am excited/thrilled" opener'],
  [/\b(?:delve|tapestry|leverage[sd]?|seamless(?:ly)?|cutting-edge|testament|pivotal)\b/i, 'stock AI wording'],
  [/\bnot (?:just|only|merely)\b[^.]{0,60}\bbut\b/i, '"not just X but Y" contrast'],
  [/\b[\w-]+, [\w-]+,? and [\w-]+\b.*\b[\w-]+, [\w-]+,? and [\w-]+\b/i, 'repeated triads'],
]
/** Leftover AI tells in the final text: shown as a warning, never a block. */
export const aiTells = (text: string): string[] => TELLS.filter(([re]) => re.test(text)).map(([, label]) => label)

const numbers = (t: string) => new Set((t.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map(n => n.replace(/,/g, '')))
/** Facts the first text had and the rewrite lost (numbers, skills, the job's own names): a humanizer pass must keep every one. */
export function lostFacts(before: string, after: string, names: string[] = []): string[] {
  const out: string[] = []
  const kept = numbers(after)
  for (const n of numbers(before)) if (!kept.has(n)) out.push(`the number ${n}`)
  const skills = extractSkills(after)
  for (const s of extractSkills(before)) if (!skills.has(s)) out.push(`the skill ${s}`)
  for (const n of names) if (n && before.includes(n) && !after.includes(n)) out.push(n)
  return out
}
