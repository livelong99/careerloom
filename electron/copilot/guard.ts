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

// Only claims about the candidate are checked against the résumé: general knowledge ("Dijkstra runs in O(E log V)") is the point of the copilot.
// A line counts as a claim when it speaks in the first person, states a money figure, or reports a percentage as an achieved outcome
// ("cut costs by 75%"; a bare "99.9% availability" or "above 90%" is a target or rule of thumb, which is what system-design answers are made of).
const OUTCOME = /\b(?:cut|reduced|improved|saved|increased|grew|boosted|lowered|achieved|delivered|raised|dropped|decreased|scaled|doubled|halved|shaved)\b/i
const PERSONAL = /\b(?:I|I'm|I've|I'd|I'll|me|my|mine|we|we've|we're|our|ours)\b|[$€£₹]\s*\d/i
const isClaim = (line: string): boolean => PERSONAL.test(line) || (/\d\s*%/.test(line) && OUTCOME.test(line))

// A coding answer carries its code inside [SAY]: loop variables ("i"), literals and comments there are not claims about the candidate.
const CODE_FENCE = /```[\s\S]*?(?:```|$)/g

function draftLines(s: Suggestion): string {
  const star = s.star ? [s.star.s, s.star.t, s.star.a, s.star.r] : []
  const personal = [s.say.replace(CODE_FENCE, ''), ...s.bullets].flatMap(t => t.split('\n')).filter(isClaim)
  return [...personal, ...star].map(t => t.trim()).filter(Boolean).map(t => `- ${t}`).join('\n')
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
