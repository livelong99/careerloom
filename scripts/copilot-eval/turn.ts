// One question through the real engine (buildPrompt -> provider -> parser -> guard) with the provider wrapped to record raw text and timings.
import { createAnswerEngine, type AnswerProvider, type ProviderPrompt, type StreamItem } from '../../electron/copilot/engine'
import { buildGrounding } from '../../electron/copilot/context'
import { heuristicHint } from '../../electron/copilot/detector'
import { routeQuestion } from '../../electron/copilot/routing'
import type { CopilotConfig, Suggestion, TranscriptLine } from '../../electron/copilot/types'
import type { EvalQuestion } from './score'

export type Turn = { raw: string; suggestion: Suggestion | null; error: string | null; model: string | null; firstTokenMs: number | null; totalMs: number | null; costUsd: number; attempts: number }

export async function runTurn(q: EvalQuestion, provider: AnswerProvider, cfg: CopilotConfig, cv: string): Promise<Turn> {
  let raw = ''
  let attempts = 0
  let t0 = 0
  let firstTokenMs: number | null = null
  let totalMs: number | null = null
  let costUsd = 0
  const recording: AnswerProvider = { id: provider.id, async *stream(p: ProviderPrompt): AsyncGenerator<StreamItem> {
    attempts++; raw = ''; firstTokenMs = null; t0 = performance.now()
    for await (const it of provider.stream(p)) {
      if ('delta' in it) { firstTokenMs ??= performance.now() - t0; raw += it.delta } else costUsd += it.usage.costUsd ?? 0
      yield it
    }
    totalMs = performance.now() - t0
  } }
  const engine = createAnswerEngine({ provider: recording, config: () => cfg, partialEveryMs: 0, sleep: async () => undefined,
    grounding: () => buildGrounding({ jobId: 'eval', title: 'Platform Engineer', company: 'Acme', report: null, rawReport: null, posting: null }, cv) })
  const transcript: TranscriptLine[] = (q.prior ?? []).map(([speaker, text], i) => ({ id: `p${i}`, speaker, text, final: true, t0: i, t1: i + 1 }))
  const question = { id: q.id, text: q.text, type: q.type, confidence: 1, at: 0, auto: false, hint: heuristicHint(q.text) }
  const kind = q.prior ? 'followup' : 'answer'
  let suggestion: Suggestion | null = null
  let error: string | null = null
  try {
    for await (const s of engine.answer({ question, transcript, kind, signal: new AbortController().signal, route: routeQuestion(question, cfg.engine, kind) })) suggestion = s
  } catch (e) { error = e instanceof Error ? e.message : String(e) }
  return { raw, suggestion, error, model: suggestion?.model ?? null, firstTokenMs, totalMs, costUsd, attempts }
}
