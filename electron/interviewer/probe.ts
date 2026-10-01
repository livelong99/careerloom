// Follow-up checklist (plan §6.3): the LLM answers booleans, code decides. ≤ 2 probes per question, always for the weakest element.
import { buildPersona } from './persona'
import type { InterviewPlan } from './types'

export type ProbeDecision = { probe: boolean; weakest: string | null }
export const MAX_PROBES = 2
/** Checklist elements in the order we probe them first. */
const ELEMENTS = ['result', 'metric', 'ownership', 'tradeoff', 'example', 'situation', 'action', 'task'] as const
export type Element = (typeof ELEMENTS)[number]
const STAR: ReadonlySet<Element> = new Set(['situation', 'task', 'action', 'result'])
const CHANCE = [0, 0.2, 0.4, 0.6, 0.75, 0.9] as const
const ANSWER_CLIP = 1500

/** Fixed wording per element (keeps depth up, no free-form LLM phrasing). */
export const PROBE_TEXT: Record<Element, string> = {
  result: 'What was the outcome in the end?',
  metric: 'Can you put a number on that: how did you measure the impact?',
  ownership: 'You said "we": what was your own part in it?',
  tradeoff: 'What trade-offs did you weigh, and why did you choose that one?',
  example: 'Can you walk me through a specific example?',
  situation: 'What was the situation, and what made it hard?',
  action: 'What exactly did you do?',
  task: 'What were you responsible for there?',
}
export const probeText = (weakest: string): string => PROBE_TEXT[weakest as Element] ?? PROBE_TEXT.example

const CHECK_SYSTEM = `Check an interview answer against a checklist. Reply with JSON only: {${ELEMENTS.map(e => `"${e}":true|false`).join(',')}}. true = the answer clearly covers it.`
const parse = (text: string): Partial<Record<Element, boolean>> | null => {
  try {
    const o = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '') as Record<string, unknown>
    return Object.fromEntries(ELEMENTS.flatMap(e => (typeof o[e] === 'boolean' ? [[e, o[e]]] : [])))
  } catch { return null }
}

export async function decideProbe(
  answer: string, plan: InterviewPlan, probesSoFar: number, call: (system: string, user: string) => Promise<string>, rand: () => number = Math.random,
): Promise<ProbeDecision> {
  const none: ProbeDecision = { probe: false, weakest: null }
  if (probesSoFar >= MAX_PROBES || !answer.trim()) return none
  let got: Partial<Record<Element, boolean>> | null
  try { got = parse(await call(`${buildPersona(plan, null)}\n${CHECK_SYSTEM}`, `<<<ANSWER\n${answer.slice(0, ANSWER_CLIP)}\nANSWER>>>`)) } catch { return none }
  if (!got) return none
  const star = plan.mode === 'behavioural' || plan.mode === 'mixed' || plan.mode === 'recruiter'
  const weakest = ELEMENTS.find(e => got![e] === false && (star || !STAR.has(e))) ?? null
  if (!weakest) return none
  return rand() < CHANCE[plan.persona.strictness] ? { probe: true, weakest } : { probe: false, weakest }
}
