// Speculative start (PERF-2, setting off by default): on a finished, question-shaped interviewer partial begin the answer
// request now and hold its output; when the final arrives, adopt the run if the text is (nearly) the same, otherwise abort and
// let the normal path restart. Held output means a wrong guess is never shown. Wasted work is counted, not hidden: aborted
// requests are not on the engine's cost meter, so three misses in a row switch speculation off for the session.
import { classifyByRules, heuristicHint, questionType } from './detector'
import type { AnswerEngine } from './engine'
import { routeQuestion } from './routing'
import { isSentenceFinal, normFinal } from './stt/endpoint'
import type { CopilotConfig, DetectedQuestion, Suggestion, TranscriptLine } from './types'

export type SpecStats = { started: number; hits: number; misses: number; hitRate: number | null; wastedTokens: number; disabled: boolean }
export type SpecRun = { stream: AsyncIterable<Suggestion>; abort(): void }
export type SpeculatorDeps = { engine: AnswerEngine; transcript: () => TranscriptLine[]; config: () => CopilotConfig; now?: () => number }

const MATCH_RATIO = 0.2 // up to one word in five may differ
const MAX_CONSECUTIVE_MISSES = 3

/** Word-level edit distance over the longer text (case, punctuation and spacing ignored). */
export function wordDistanceRatio(a: string, b: string): number {
  const x = normFinal(a).split(' ').filter(Boolean), y = normFinal(b).split(' ').filter(Boolean)
  if (!x.length && !y.length) return 0
  let prev = Array.from({ length: y.length + 1 }, (_, j) => j)
  for (let i = 1; i <= x.length; i++) {
    const cur = [i]
    for (let j = 1; j <= y.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (x[i - 1] === y[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[y.length]! / Math.max(x.length, y.length)
}

type Held = { items: Suggestion[]; done: boolean; error: unknown; wake: (() => void) | null }
type Entry = { text: string; ac: AbortController; held: Held; failed: boolean }

export function createSpeculator(d: SpeculatorDeps) {
  const runs = new Map<string, Entry>()
  let started = 0, hits = 0, misses = 0, wasted = 0, streak = 0, n = 0
  const disabled = (): boolean => streak >= MAX_CONSECUTIVE_MISSES
  // A coarse estimate (chars/4 of what was already streamed): the provider reports no usage for an aborted request.
  const streamedTokens = (h: Held): number => Math.ceil(h.items.reduce((m, s) => Math.max(m, s.say.length + s.bullets.join('').length), 0) / 4)

  function consume(req: Entry, gen: AsyncIterable<Suggestion>) {
    void (async () => {
      try { for await (const s of gen) { req.held.items.push(s); req.held.wake?.() } } catch (e) { req.held.error = e; req.failed = true }
      req.held.done = true; req.held.wake?.()
    })()
  }

  async function* release(h: Held, questionId: string): AsyncGenerator<Suggestion> {
    for (let i = 0; ; ) {
      if (i < h.items.length) { yield { ...h.items[i++]!, questionId }; continue }
      if (h.done) { if (h.error) throw h.error; return }
      await new Promise<void>(r => { h.wake = r })
      h.wake = null
    }
  }

  return {
    /** Feed every interviewer partial; starts at most one request per transcript line. */
    onPartial(l: TranscriptLine): void {
      const cfg = d.config()
      if (l.final || l.speaker !== 'interviewer' || !cfg.engine.autoAnswer || !cfg.engine.speculativeStart || disabled() || runs.has(l.id)) return
      const text = l.text.trim()
      if (!isSentenceFinal(text) || classifyByRules(text).verdict !== 'question') return // "stable" = a finished question-shaped sentence
      const q: DetectedQuestion = { id: `qs${++n}`, text, type: questionType(text), confidence: 0.7, at: (d.now ?? Date.now)(), auto: true, hint: heuristicHint(text) }
      const route = routeQuestion(q, cfg.engine)
      if (route.skipLlm) return
      const ac = new AbortController()
      const entry: Entry = { text, ac, held: { items: [], done: false, error: null, wake: null }, failed: false }
      runs.set(l.id, entry)
      started++
      consume(entry, d.engine.answer({ question: q, transcript: d.transcript().filter(t => t.final), kind: 'answer', signal: ac.signal, route }))
    },
    /** The final for `lineId` arrived: adopt the held run (hit) or abort it (miss). Null means "start the normal request". */
    take(lineId: string, finalText: string, questionId: string): SpecRun | null {
      const e = runs.get(lineId)
      if (!e) return null
      runs.delete(lineId)
      if (!e.failed && wordDistanceRatio(e.text, finalText) <= MATCH_RATIO) {
        hits++; streak = 0
        return { stream: release(e.held, questionId), abort: () => e.ac.abort() }
      }
      e.ac.abort(); misses++; streak++; wasted += streamedTokens(e.held)
      return null
    },
    cancel(): void { for (const e of runs.values()) e.ac.abort(); runs.clear() },
    stats: (): SpecStats => ({ started, hits, misses, hitRate: hits + misses ? hits / (hits + misses) : null, wastedTokens: wasted, disabled: disabled() }),
  }
}
