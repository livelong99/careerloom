// Ported from Open-Cluely (owner's project), adapted for Careerloom: request queue + rolling history from
// services/ai/gemini-service.js, the action lock from main-process/features/assistant/ipc.js (latest request wins).
// Streams a grounded answer as partial Suggestions, then a final guarded one. No tool loop, no agent CLIs.
import recommended from './recommended-models.json'
import { createCostMeter, type CostMeter } from './cost'
import { parseClassification, CLASSIFY_MAX_TOKENS, CLASSIFY_SYSTEM, type Classify } from './detector'
import { modelOrder, withFailover } from './failover'
import { guardSuggestion } from './guard'
import { estimateTokens, windowLines, type GroundingContext } from './context'
import { buildPrompt, parseSuggestion, type PromptKind } from './prompts'
import { collectText, LlmError } from './providers/openrouter'
import { createRedactor } from './redact'
import type { CopilotConfig, DetectedQuestion, Suggestion, TranscriptLine } from './types'

export type AnswerRequest = { question: DetectedQuestion; transcript: TranscriptLine[]; kind: PromptKind; signal: AbortSignal }
export type ProviderPrompt = { system: string; messages: Array<{ role: 'user' | 'assistant'; content: string }>; model: string; signal: AbortSignal; maxTokens?: number }
export type StreamItem = { delta: string } | { usage: { promptTokens: number; completionTokens: number; costUsd?: number | null } }
/** Streaming provider (OpenRouter in M1); the interface keeps other providers possible. */
export interface AnswerProvider {
  readonly id: CopilotConfig['engine']['provider']
  stream(prompt: ProviderPrompt): AsyncIterable<StreamItem>
}
/** Emits partial Suggestions (done:false) then a final one; abortable. */
export interface AnswerEngine {
  answer(req: AnswerRequest): AsyncIterable<Suggestion>
  cancelAll(): void
}

type Tier = Suggestion['tier']
type Recommended = { tiers: Record<Tier, Array<{ id: string }>> }
const REC = recommended as Recommended
export const defaultModelFor = (tier: Tier): string => REC.tiers[tier][0]!.id
const fallbacksFor = (tier: Tier, primary: string): string[] => REC.tiers[tier].map(m => m.id).filter(id => id !== primary).slice(0, 2)

/** Design and coding questions go to the Deep tier when escalation is on; everything else uses the chosen tier. */
export function pickTier(cfg: CopilotConfig['engine'], type: DetectedQuestion['type'], kind: PromptKind): Tier {
  if (kind === 'answer' && cfg.escalateForDesignCoding && (type === 'system-design' || type === 'coding')) return 'deep'
  return cfg.tier
}

export type EngineDeps = {
  provider: AnswerProvider
  config: () => CopilotConfig
  grounding: () => GroundingContext | Promise<GroundingContext>
  cost?: CostMeter
  /** Per-session spend ceiling in USD (plan §10, default $1.00). */
  ceilingUsd?: number
  now?: () => number
  /** Minimum gap between partial Suggestions; the UI also throttles, this keeps IPC quiet. */
  partialEveryMs?: number
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  onRetry?: (info: { attempt: number; from: string; to: string; code: string }) => void
  /** Names to mask when redaction is on (the user, the interviewer). */
  redactNames?: () => string[]
}

const MAX_TOKENS: Record<Tier, number> = { fast: 450, balanced: 550, deep: 900 }
const WINDOW_TOKENS = 1200
const WINDOW_LINES = 8

export function createAnswerEngine(deps: EngineDeps): AnswerEngine {
  const now = deps.now ?? Date.now
  const cost = deps.cost ?? createCostMeter()
  const active = new Set<AbortController>()
  const gap = deps.partialEveryMs ?? 80

  async function* answer(req: AnswerRequest): AsyncGenerator<Suggestion> {
    const cfg = deps.config()
    if (deps.ceilingUsd !== undefined && cost.exceeds(deps.ceilingUsd)) throw new LlmError('budget', `Session spend limit of $${deps.ceilingUsd.toFixed(2)} reached`)
    if (req.signal.aborted) return
    // Latest request wins: a new hotkey press supersedes whatever is still streaming.
    for (const c of active) c.abort()
    const ac = new AbortController()
    active.add(ac)
    const onAbort = () => ac.abort()
    req.signal.addEventListener('abort', onAbort, { once: true })
    try {
      const tier = pickTier(cfg.engine, req.question.type, req.kind)
      const model = cfg.engine.models[tier] ?? defaultModelFor(tier)
      const g = await deps.grounding()
      const mask = cfg.privacy.redact ? createRedactor(deps.redactNames?.() ?? []) : (t: string) => t
      const lines = windowLines(req.transcript, WINDOW_TOKENS, { maxLines: WINDOW_LINES }).map(l => ({ ...l, text: mask(l.text) }))
      const question = { ...req.question, text: mask(req.question.text) }
      const prompt = buildPrompt({ grounding: g.prefix, coaching: cfg.coaching, question, transcript: lines, kind: req.kind })
      const promptChars = prompt.system.length + prompt.messages.reduce((n, m) => n + m.content.length, 0)

      const start = now()
      let text = ''
      let firstTokenMs: number | null = null
      let usage: { promptTokens: number; completionTokens: number; costUsd?: number | null } | null = null
      let usedModel = model
      const base: Suggestion = { questionId: req.question.id, model, tier, say: '', bullets: [], star: null, proof: [], flags: [], done: false, firstTokenMs: null, totalMs: null, costUsd: null }
      const snapshot = (done: boolean): Suggestion => ({ ...base, model: usedModel, ...parseSuggestion(text, done), done, firstTokenMs, totalMs: done ? now() - start : null })

      const stream = withFailover(modelOrder(model, fallbacksFor(tier, model)), m => {
        usedModel = m
        return deps.provider.stream({ system: prompt.system, messages: prompt.messages, model: m, signal: ac.signal, maxTokens: MAX_TOKENS[tier] })
      }, { signal: ac.signal, sleep: deps.sleep, onRetry: deps.onRetry })

      let lastYield = -Infinity
      try {
        for await (const item of stream) {
          if ('usage' in item) { usage = item.usage; continue }
          firstTokenMs ??= now() - start
          text += item.delta
          if (now() - lastYield >= gap) { lastYield = now(); yield snapshot(false) }
        }
      } catch (e) {
        if (ac.signal.aborted || (e instanceof LlmError && e.code === 'aborted')) return // superseded or stopped: say nothing more
        if (text) yield snapshot(false) // keep what the user is already reading; the caller surfaces the error
        throw e
      }
      if (ac.signal.aborted) return

      const promptTokens = usage?.promptTokens ?? Math.ceil(promptChars / 4)
      const completionTokens = usage?.completionTokens ?? estimateTokens(text)
      const costUsd = cost.add(usedModel, promptTokens, completionTokens, usage?.costUsd ?? null)
      const final = snapshot(true)
      const guarded = guardSuggestion({ cv: g.cv, stories: g.storiesText, known: [...g.known, req.question.text] }, final, { factCheck: cfg.engine.factCheck })
      yield { ...guarded, costUsd }
    } finally {
      req.signal.removeEventListener('abort', onAbort)
      active.delete(ac)
    }
  }

  return { answer, cancelAll() { for (const c of active) c.abort() } }
}

/** The optional tiny classify call for ambiguous interviewer lines (plan §3.3). Fails closed: null means "not a question". */
export function createLlmClassifier(provider: AnswerProvider, model: string, opts: { timeoutMs?: number; onUsage?: (u: { promptTokens: number; completionTokens: number }) => void } = {}): Classify {
  return async text => {
    try {
      const { text: reply, usage } = await collectText(provider, {
        system: CLASSIFY_SYSTEM, model, maxTokens: CLASSIFY_MAX_TOKENS,
        messages: [{ role: 'user', content: `<<<LINE\n${text.replace(/<<<|>>>/g, '')}\nLINE>>>` }],
        signal: AbortSignal.timeout(opts.timeoutMs ?? 2500),
      })
      if (usage) opts.onUsage?.(usage)
      return parseClassification(reply)
    } catch { return null }
  }
}
