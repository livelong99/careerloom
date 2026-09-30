// Practice mode: a mock interviewer that asks the report's likely questions and listens for your spoken answers.
// Pure: input (answers) and output (questions, transcript lines) go through injected sinks, so it runs on fake STT + a fake provider.
import { createHash } from 'node:crypto'

import type { ReportView } from '../job-view/types'
import type { DetectedQuestion, PracticeQuestion, QuestionType, TranscriptLine } from './types'

const MAX_QUESTIONS = 12
const MAX_FOLLOWUP_CHARS = 240

export const GENERIC_QUESTIONS: ReadonlyArray<{ text: string; type: QuestionType }> = [
  { text: 'Tell me about yourself and why this role.', type: 'behavioural' },
  { text: 'Describe a project you are proud of and your part in it.', type: 'behavioural' },
  { text: 'Tell me about a time something went wrong and how you handled it.', type: 'behavioural' },
  { text: 'Describe a disagreement with a teammate and how it was resolved.', type: 'behavioural' },
  { text: 'What is the hardest technical problem you solved recently?', type: 'technical' },
  { text: 'Where do you want to grow in the next two years?', type: 'other' },
]

/** Stable across calls so `lastScore` and saved sessions keep pointing at the same question. */
const qid = (text: string): string => `q-${createHash('sha1').update(text.trim().toLowerCase()).digest('hex').slice(0, 10)}`

const cellOf = (row: string[], i: number): string => (row[i] ?? '').replace(/\*\*|`/g, '').trim()

/** Report's interview plan (STAR stories, red-flag Q&A) and gaps become the queue; custom questions go last; generic when no report. */
export function questionsFromReport(report: ReportView | null, custom: string[], lastScore: Record<string, number>): PracticeQuestion[] {
  const raw: Array<{ text: string; type: QuestionType; source: 'report' | 'custom' }> = []
  const section = report?.sections.find(s => s.kind === 'interview')
  for (const b of section?.blocks ?? []) {
    if (b.kind === 'table') {
      const req = b.headers.findIndex(h => /requirement/i.test(h))
      if (req < 0 || !b.headers.some(h => /story/i.test(h))) continue
      for (const row of b.rows) { const r = cellOf(row, req); if (r) raw.push({ text: `Tell me about a time you worked with ${r}.`, type: 'behavioural', source: 'report' }) }
    } else if (b.kind === 'md') {
      for (const m of b.text.matchAll(/\*\*Q:\s*(.+?)\*\*/g)) raw.push({ text: m[1]!.trim(), type: 'behavioural', source: 'report' })
    }
  }
  for (const g of report?.gaps ?? []) if (g.title) raw.push({ text: `Your résumé does not show ${g.title}. How would you handle that on this job?`, type: 'technical', source: 'report' })
  if (raw.length === 0) for (const g of GENERIC_QUESTIONS) raw.push({ ...g, source: 'custom' })
  for (const c of custom) if (c.trim()) raw.push({ text: c.trim(), type: 'other', source: 'custom' })
  const seen = new Set<string>()
  return raw.flatMap(q => {
    const id = qid(q.text)
    if (seen.has(id)) return []
    seen.add(id)
    return [{ id, text: q.text, type: q.type, source: q.source, lastScore: lastScore[id] ?? null }]
  }).slice(0, MAX_QUESTIONS)
}

/** The model's follow-up: one short question, or null for NONE/empty/runaway output. */
export function parseFollowUp(text: string): string | null {
  const t = text.trim().replace(/^["'“”]+|["'“”]+$/g, '').trim()
  if (!t || /^none\.?$/i.test(t) || t.length > MAX_FOLLOWUP_CHARS) return null
  return t
}

export const FOLLOWUP_SYSTEM = 'You are a mock interviewer. Given the question and the candidate\'s answer, reply with ONE short follow-up question that probes the weakest part of the answer, or NONE. No preamble.'

export type PracticeSink = { question(q: DetectedQuestion): void; line(l: TranscriptLine): void; done(): void }
export type PracticeOptions = {
  questions: PracticeQuestion[]; followups: boolean; answerMs: number
  /** Engine call for follow-ups (text in, text out); omitted = no follow-ups. */
  complete?: (system: string, user: string) => Promise<string>
  sink: PracticeSink; now?: () => number
}
export type PracticeRunner = { start(): void; feed(line: TranscriptLine, endOfTurn: boolean): Promise<void>; stop(): void }

export function createPracticeRunner(o: PracticeOptions): PracticeRunner {
  const now = o.now ?? Date.now
  let index = -1
  let current: PracticeQuestion | null = null
  let answer: string[] = []
  let followedUp = false
  let stopped = false
  let busy = false
  let timer: ReturnType<typeof setTimeout> | null = null

  const arm = (): void => { clear(); timer = setTimeout(() => { void advance() }, o.answerMs) }
  const clear = (): void => { if (timer) { clearTimeout(timer); timer = null } }
  const ask = (q: PracticeQuestion): void => {
    current = q; answer = []
    const at = now()
    o.sink.question({ id: q.id, text: q.text, type: q.type, confidence: 1, at, auto: false })
    o.sink.line({ id: `ask-${q.id}`, speaker: 'interviewer', text: q.text, final: true, t0: at, t1: at })
    arm()
  }
  const next = (): void => {
    index += 1
    const q = o.questions[index]
    if (q) { followedUp = false; ask(q) } else { clear(); current = null; stopped = true; o.sink.done() }
  }
  const followUp = async (): Promise<PracticeQuestion | null> => {
    if (!o.followups || !o.complete || followedUp || !current || answer.length === 0) return null
    followedUp = true
    try {
      const text = parseFollowUp(await o.complete(FOLLOWUP_SYSTEM, `Question: ${current.text}\nAnswer: ${answer.join(' ')}`))
      return text ? { id: `${current.id}-f1`, text, type: current.type, source: current.source, lastScore: null } : null
    } catch { return null }
  }
  async function advance(): Promise<void> {
    if (stopped || busy) return
    busy = true; clear()
    try {
      const f = await followUp()
      if (stopped) return
      if (f) ask(f); else next()
    } finally { busy = false }
  }

  return {
    start() { if (index === -1) next() },
    async feed(line, endOfTurn) {
      if (stopped || line.speaker !== 'you' || !current) return
      if (endOfTurn) { o.sink.line(line); answer.push(line.text); await advance() }
    },
    stop() { stopped = true; clear() },
  }
}
