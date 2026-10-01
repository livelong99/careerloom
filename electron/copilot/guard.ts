// After the stream ends (plan §3.4): proof[] must quote the résumé or a story verbatim, and factCheck flags anything the
// answer adds that the résumé/stories/question do not contain. Flags never remove text the user is already reading.
import { factCheck } from '../ats/factCheck'
import type { Suggestion } from './types'

export type GuardSources = {
  cv: string
  /** STAR stories and other grounding the model may quote. */
  stories?: string
  /** Facts the answer may repeat without being invented: the question, job title, company, tools named in the posting. */
  known?: string[]
}
export interface AnswerGuard { check(src: GuardSources, suggestion: Suggestion): Suggestion }

const MIN_QUOTE = 8
const collapse = (s: string) => s.replace(/\s+/g, ' ').trim()

function draftLines(s: Suggestion): string {
  const star = s.star ? [s.star.s, s.star.t, s.star.a, s.star.r] : []
  return [s.say, ...s.bullets, ...star].flatMap(t => t.split('\n')).map(t => t.trim()).filter(Boolean).map(t => `- ${t}`).join('\n')
}

const KINDS: Array<[RegExp, Suggestion['flags'][number]['kind']]> = [
  [/^The number (.+) is not in/, 'unsupported-number'],
  [/^The skill "(.+)" is not in/, 'unsupported-skill'],
  [/^"(.+)" is not in/, 'unsupported-name'],
]

export function guardSuggestion(src: GuardSources, s: Suggestion, opts: { factCheck?: boolean } = {}): Suggestion {
  const pool = collapse(`${src.cv}\n${src.stories ?? ''}`)
  const seen = new Set<string>()
  const proof = s.proof.flatMap(p => {
    // Question-base text is interview-side context: a `kb` source is never proof about the candidate, even if the words happen to match.
    if (/^kb\b/i.test(p.source.trim())) return []
    const quote = collapse(p.quote)
    if (quote.length < MIN_QUOTE || !pool.includes(quote) || seen.has(quote)) return []
    seen.add(quote)
    return [{ ...p, quote }]
  })
  let flags = s.flags
  if (opts.factCheck !== false) {
    const known = [src.stories ?? '', ...(src.known ?? [])]
    const { violations } = factCheck(src.cv, `${src.cv}\n${draftLines(s)}`, known)
    flags = [...s.flags, ...violations.flatMap(v => {
      for (const [re, kind] of KINDS) { const m = re.exec(v); if (m) return [{ kind, text: m[1]! }] }
      return []
    })]
  }
  return { ...s, proof, flags }
}

export const answerGuard: AnswerGuard = { check: (src, s) => guardSuggestion(src, s) }
