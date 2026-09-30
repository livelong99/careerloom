// Humanizer: the vendored Agent Skill (skill.ts) used as a second, cheap pass over prose, plus a short
// rule list folded into generation prompts so the first draft is already closer.
import { HUMANIZER_SKILL } from './skill'

export const HUMANIZER_VERSION = '3.1.0'
export const HUMANIZER_UPSTREAM = 'https://github.com/blader/humanizer'

/** ~12 lines distilled from the skill; cheap enough to ride along in every generation prompt. */
export const CONDENSED_RULES = `Writing rules (plain, specific, human):
- No "not X but Y" contrasts and no one-line closers that repeat the point.
- No staged openers ("I am excited to", "In today's fast-paced world").
- No forced triads: list two things, or four, or just one.
- No em dashes or en dashes. Use a period, comma, colon or parentheses.
- Drop inflated significance and sales language (pivotal, testament, passionate, thrilled, cutting-edge).
- Avoid stock AI words: delve, leverage, tapestry, seamless, robust, landscape, realm, showcase.
- Plain verbs (is, has, built, ran) instead of "serves as", "boasts", "stands as".
- No bold, bullets, headings or emoji inside prose.
- No chatbot leftovers ("Certainly!", "I hope this helps").
- Every sentence adds a fact the reader does not have; use only nouns and numbers from the source.
- Vary sentence length; write as one person to one reader.`

const FINAL = /<final>([\s\S]*?)<\/final>/g

export function humanizePrompt(text: string, voiceSample?: string): string {
  return `${HUMANIZER_SKILL}

---
TASK (embedded mode: return only the final text)
Rewrite the TEXT below following the skill above. Keep every fact, number, company name, job title and date exactly as written. Do not add any claim, skill, tool or experience. Keep the paragraph breaks and roughly the same length.${voiceSample?.trim() ? `\nMatch the voice of this writing sample (not its content):\n<sample>\n${voiceSample.trim().slice(0, 2000)}\n</sample>` : ''}
Reply with the rewritten text between <final> and </final> and nothing else.

TEXT:
<text>
${text}
</text>`
}

/** The text between the last <final> tags of a reply (the model may echo the tags once while thinking aloud). */
export function readFinal(reply: string): string | null {
  const all = [...reply.matchAll(FINAL)]
  const t = all.at(-1)?.[1]?.trim()
  return t || null
}

export type TextCall = (prompt: string) => Promise<{ text: string; tokens: number | null; model: string | null }>
export type Humanized = { text: string; tokens: number | null; model: string | null }

/** One call. Throws when the reply has no <final> block, so the caller keeps the unhumanized text. */
export async function humanize(text: string, run: TextCall, opts: { voiceSample?: string } = {}): Promise<Humanized> {
  const r = await run(humanizePrompt(text, opts.voiceSample))
  const out = readFinal(r.text)
  if (!out) throw new Error('The humanizer reply had no <final> text')
  return { text: out, tokens: r.tokens, model: r.model }
}
