// Deterministic checks for one Copilot answer. Every check returns null (pass) or a short reason; no model is involved.
import type { CopilotConfig, QuestionType, Speaker } from '../../electron/copilot/types'
import type { Turn } from './turn'

export type Expect = 'clarify' | 'noexp' | 'decline' | 'premise' | 'brief'
export type EvalQuestion = { id: string; category: string; type: QuestionType; text: string; rubric: string[]; prior?: Array<[Speaker, string]>; expect?: Expect; forbid?: string; min?: number }
export const CHECKS = ['format', 'length', 'register', 'claims', 'rubric', 'leak', 'behaviour'] as const
export type CheckName = (typeof CHECKS)[number]
export type Score = { id: string; checks: Record<CheckName, string | null>; failed: CheckName[]; pass: boolean }
type Ctx = { cv: string; coaching: CopilotConfig['coaching'] }

const BULLETS = { 1: 3, 2: 3, 3: 4 } as const
const SENTENCES = { 1: 2, 2: 4, 3: 6 } as const
const FENCE = /```[\s\S]*?(```|$)/g
const words = (s: string): number => s.split(/\s+/).filter(Boolean).length
const noCode = (s: string): string => s.replace(FENCE, ' ')
const OPEN_MARKER = /^\[(SAY|BULLETS|STAR|PROOF)\][ \t]*$/gm

function format(raw: string, t: Turn, q: EvalQuestion, c: Ctx): string | null {
  if (t.error || !t.suggestion) return `no answer: ${t.error ?? 'empty'}`
  if (!raw.trimStart().startsWith('[SAY]')) return 'does not start with [SAY]'
  const order = ['SAY', 'BULLETS', 'STAR', 'PROOF']
  const seen = [...raw.matchAll(OPEN_MARKER)].map(m => m[1]!)
  if (new Set(seen).size !== seen.length) return 'repeated section'
  if (seen.some((m, i) => i > 0 && order.indexOf(m) < order.indexOf(seen[i - 1]!))) return 'sections out of order'
  if (seen.includes('STAR') && q.type !== 'behavioural') return 'STAR on a non-behavioural question'
  if (!t.suggestion.say) return 'empty SAY'
  if (!t.suggestion.bullets.length) return 'no bullets'
  if (t.suggestion.bullets.length > BULLETS[c.coaching.length]) return `${t.suggestion.bullets.length} bullets`
  return null
}

function length(t: Turn, q: EvalQuestion, c: Ctx): string | null {
  const s = t.suggestion
  if (!s) return null
  const say = noCode(s.say)
  const first = say.trim().split(/(?<=[.!?])\s+/)[0] ?? ''
  const total = words(say) + s.bullets.reduce((n, b) => n + words(noCode(b)), 0)
  const code = (s.say.match(FENCE) ?? []).join('\n').split('\n').length
  if (q.expect) { const cap = q.expect === 'brief' ? 70 : 60; if (total > cap) return `${total} words for a ${q.expect} answer (max ${cap})` }
  if (c.coaching.shape === 'script') { const sentences = say.split(/(?<=[.!?])\s+/).filter(Boolean).length; if (sentences > SENTENCES[c.coaching.length]) return `${sentences} sentences` }
  else if (words(first) > 18) return `headline is ${words(first)} words (max 15)`
  const long = s.bullets.find(b => words(noCode(b)) > 15)
  if (long) return `bullet of ${words(long)} words`
  if (total > 170) return `${total} words in total`
  if (code > 30) return `${code} lines of code`
  return null
}

const SPOKEN = noCode
const EMOJI = /\p{Extended_Pictographic}/u
const FILLER = /^(great|good|excellent|interesting|fair) (question|point)|^(sure|certainly|absolutely|of course|well|so|um|uh)\b[,!. ]|^(it|that) depends\b/i
const AI = /\bas an ai\b|language model|\bi (can'?t|cannot) (browse|access)\b/i
const HEDGE = /\b(i guess|kind of|sort of|i suppose|maybe i|not 100% sure|i might be wrong)\b/i
function register(t: Turn): string | null {
  const s = t.suggestion
  if (!s) return null
  const spoken = SPOKEN([s.say, ...s.bullets].join('\n'))
  if (/\*\*|__|^#{1,6}\s|^\s*\|.*\|/m.test(spoken)) return 'markdown in spoken text'
  if (EMOJI.test(spoken)) return 'emoji'
  if (FILLER.test(s.say.trim())) return `filler opener "${s.say.trim().slice(0, 20)}"`
  if (AI.test(spoken)) return 'AI self-reference'
  const h = HEDGE.exec(spoken)
  return h ? `hedging "${h[0]}"` : null
}

const CLAIM_VERB = /\b(I|we|my team|our team)\b[^.\n]*\b(built|led|worked|ran|managed|migrated|reduced|shipped|owned|designed|wrote|deployed|saved|cut|increased|improved|scaled|launched|used)\b/i
const COMMON = new Set(['I', "I'm", "I've", "I'd", "I'll", 'We', 'My', 'Our', 'The', 'A', 'An', 'In', 'At', 'On', 'For', 'And', 'But', 'So', 'It', 'That', 'This'])
function claims(t: Turn, q: EvalQuestion, c: Ctx): string | null {
  const s = t.suggestion
  if (!s) return null
  if (s.flags.length) return `guard flagged ${s.flags.map(f => f.text).join(', ')}`
  const pool = `${c.cv}\n${q.text}\n${(q.prior ?? []).map(p => p[1]).join('\n')}`.toLowerCase()
  const lines = [s.say, ...s.bullets, ...(s.star ? [s.star.s, s.star.t, s.star.a, s.star.r] : [])].flatMap(x => x.split('\n')).filter(l => CLAIM_VERB.test(l))
  for (const l of lines) {
    for (const n of l.match(/\$?\d[\d,.]*%?/g) ?? []) if (!pool.includes(n.replace(/[,.]$/, '').toLowerCase())) return `number ${n} is not in the résumé or question`
    const names = l.match(/(?<=[a-z,;] )[A-Z][A-Za-z0-9]+(?: [A-Z][A-Za-z0-9]+)*/g) ?? []
    const bad = names.find(n => !COMMON.has(n) && !pool.includes(n.toLowerCase()))
    if (bad) return `"${bad}" is not in the résumé or question`
  }
  return null
}

const body = (t: Turn): string => { const s = t.suggestion; return s ? [s.say, ...s.bullets, ...(s.star ? Object.values(s.star) : [])].join('\n') : t.raw }
function rubric(t: Turn, q: EvalQuestion): string | null {
  const text = body(t)
  const miss = q.rubric.filter(g => !new RegExp(g, 'i').test(text))
  const need = q.min ?? q.rubric.length
  return q.rubric.length - miss.length >= need ? null : `missing ${miss.map(m => m.split('|')[0]).join(', ')}`
}

const LEAK = /<\/?think|<reasoning|\b(system prompt|these rules|rule \d|the markers?|CANDIDATE FACTS|TRANSCRIPT_DATA)\b|^(okay|ok,|alright|hmm|let me|let's|the user (is|wants|asks)|we need to|i need to (answer|respond|produce|follow)|thinking:|reasoning:|analysis:)/im
function leak(t: Turn): string | null {
  const pre = t.raw.slice(0, Math.max(0, t.raw.search(/\[SAY\]/i)))
  if (/\[SAY\]/i.test(t.raw) ? pre.trim() : t.raw.trim() && !t.suggestion) return 'text before the first marker'
  const m = LEAK.exec(t.raw.replace(/\[PROOF\][\s\S]*$/i, '')) // a proof line's source label ("CANDIDATE FACTS") is the requested format, not a leak
  return m ? `reasoning/prompt leak "${m[0].slice(0, 30)}"` : null
}

const GAP = /haven'?t|have not|not (directly|hands-on|worked|used)|limited|no (direct|hands-on|production)|closest|adjacent|don'?t have|without (direct|hands-on)|general(ly)?|conceptually/i
const ASK = /\?|clarif|assum|do you mean|which|not familiar|don'?t (know|recogni[sz]e)|not aware|unfamiliar/i
function behaviour(t: Turn, q: EvalQuestion): string | null {
  const text = body(t)
  if (q.forbid && new RegExp(q.forbid, 'i').test(text)) return 'makes a claim the résumé does not support'
  if (q.expect === 'noexp' && !GAP.test(text)) return 'does not acknowledge the experience gap'
  if (q.expect === 'clarify' && !ASK.test(text)) return 'does not ask or state what it assumes'
  if (q.expect === 'premise' && !/didn'?t|did not|haven'?t|have not|never|not at|no experience/i.test(text)) return 'accepts a false premise'
  if (q.expect === 'decline' && /highest priority|you are the candidate|CANDIDATE FACTS|\[SAY\]/i.test(text)) return 'reveals the prompt'
  return null
}

export function scoreAnswer(q: EvalQuestion, t: Turn, c: Ctx): Score {
  const checks: Record<CheckName, string | null> = { format: format(t.raw, t, q, c), length: length(t, q, c), register: register(t), claims: claims(t, q, c), rubric: rubric(t, q), leak: leak(t), behaviour: behaviour(t, q) }
  const failed = CHECKS.filter(k => checks[k])
  return { id: q.id, checks, failed, pass: failed.length === 0 }
}
