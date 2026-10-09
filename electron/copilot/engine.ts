// Ported from Open-Cluely (owner's project), adapted for Careerloom: request queue + rolling history from
// services/ai/gemini-service.js, the action lock from main-process/features/assistant/ipc.js (latest request wins).
// Streams a grounded answer as partial Suggestions, then a final guarded one. No tool loop, no agent CLIs.
import { debugLog } from '../debug-log'
import { PROVIDERS, type ProviderId } from '../llm/providers'
import recommended from './recommended-models.json'
import { createCostMeter, type CostMeter } from './cost'
import { parseClassification, CLASSIFY_MAX_TOKENS, CLASSIFY_SYSTEM, type Classify } from './detector'
import { modelOrder, withFailover, withHedge } from './failover'
import { guardSuggestion } from './guard'
import { estimateTokens, windowLines, type GroundingContext } from './context'
import { buildPrompt, parseSuggestion, type KbMatch, type PromptKind } from './prompts'
import { collectText, LlmError } from './providers/openrouter'
import { createRedactor } from './redact'
import { userContentWithImage, type ImagePart, type TextPart } from './vision'
import type { Route } from './routing'
import { stageMs, type TraceLog, type TraceMarks, type TurnInfo } from './trace'
import type { CopilotConfig, DetectedQuestion, Suggestion, TranscriptLine } from './types'

/** `marks` carries the stages before the request (speech end, STT final, detector) so the trace spans the whole turn; the caller may
 *  fill it in after the request started (a speculative request learns its speech end only when the final arrives).
 *  `route` (PERF-2) overrides the tier pick, scales the token cap and may ask for a briefer prompt. */
export type AnswerRequest = { question: DetectedQuestion; transcript: TranscriptLine[]; kind: PromptKind; signal: AbortSignal; marks?: TraceMarks; route?: Route
  /** How the turn was routed and started (trace only). Shared like `marks`: read at the end of the request. */
  info?: TurnInfo
  /** A downscaled screenshot (JPEG) to send with the question; only ever goes to a vision model (see `EngineDeps.isVision`). */
  image?: { jpeg: Buffer; captureMs?: number; encodeMs?: number }
  /** Held (speculative) requests: the trace record is written when this resolves, once the late marks (speech end, release) are in. */
  afterRelease?: Promise<void> }
export type ProviderPrompt = {
  system: string; messages: Array<{ role: 'user' | 'assistant'; content: string | Array<TextPart | ImagePart> }>; model: string; signal: AbortSignal; maxTokens?: number
  /** Sticky-routing key (one per session) so follow-up turns land on the endpoint that holds the prompt cache. */
  sessionId?: string
  /** Latency trace hooks: the request left / the first response byte arrived. */
  onMark?: (m: 'request-sent' | 'first-byte') => void
}
export type StreamUsage = { promptTokens: number; completionTokens: number; costUsd?: number | null; cachedTokens?: number }
export type StreamItem = { delta: string } | { usage: StreamUsage }
/** Streaming provider (OpenRouter in M1); the interface keeps other providers possible. */
export interface AnswerProvider {
  readonly id: CopilotConfig['engine']['provider']
  stream(prompt: ProviderPrompt): AsyncIterable<StreamItem>
  /** Optional connection pre-warm (no tokens). */
  warm?(): Promise<void>
}
/** Emits partial Suggestions (done:false) then a final one; abortable. */
export interface AnswerEngine {
  answer(req: AnswerRequest): AsyncIterable<Suggestion>
  cancelAll(): void
  /** Open the connection ahead of the first answer (no tokens). */
  warm?(): Promise<void>
}

type Tier = Suggestion['tier']
type Recommended = { tiers: Record<Tier, Array<{ id: string; vision?: boolean }>> }
const REC = recommended as Recommended
export const defaultModelFor = (tier: Tier): string => REC.tiers[tier][0]!.id
/** The model for a tier: the user's pick, else the provider's default (OpenRouter's recommended list, or the provider's first fast model). */
export function tierModel(engine: CopilotConfig['engine'], tier: Tier): string {
  const picked = engine.models[tier]
  if (picked) return picked
  if (engine.provider === 'openrouter') return defaultModelFor(tier)
  const first = PROVIDERS[engine.provider].fastModels[0]
  if (!first) throw new LlmError('bad_request', `Choose a model for ${PROVIDERS[engine.provider].label} in Settings › Copilot`)
  return first
}
export const recVision = (id: string): boolean => Object.values(REC.tiers).some(l => l.some(m => m.id === id && m.vision === true))
const fallbacksFor = (provider: ProviderId, tier: Tier, primary: string, ok: (id: string) => boolean = () => true): string[] => (provider === 'openrouter' ? REC.tiers[tier].map(m => m.id) : PROVIDERS[provider].fastModels).filter(id => id !== primary && ok(id)).slice(0, 2)
/** The error for sending an image to a model that can't read it, with a vision model to offer (offer, never switch); null when fine. */
export function checkVision(model: string, tier: Tier, isVision: (id: string) => boolean = recVision): LlmError | null {
  if (isVision(model)) return null
  const e = new LlmError('no_vision', `${model} can't read images. Pick a vision model to use screenshots.`)
  e.suggestion = [...REC.tiers[tier], ...Object.values(REC.tiers).flat()].find(m => isVision(m.id))?.id
  return e
}

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
  /** Per-turn latency trace sink (ring buffer + metrics log). */
  trace?: TraceLog
  /** Sticky-routing key: one per session keeps follow-up turns on the endpoint holding the prompt cache. */
  sessionId?: () => string | undefined
  /** Does this model accept images? Defaults to the `vision` flag in recommended-models.json; the app adds OpenRouter's live list. */
  isVision?: (modelId: string) => boolean
  /** Top question-base matches for the detected question (WP7); synchronous and fast (BM25 in memory). Absent/empty: no KB section. */
  kbMatch?: (jobId: string, question: string) => KbMatch[]
  /** No usable first token after this long: ask a second model too and keep whichever answers first (default 4000; 0 turns it off). */
  hedgeAfterMs?: number
}

// Headline-first answers are short: fast/balanced fit the longest format (script x 5-6 sentences + 5 bullets + STAR) in about 300/400 tokens.
const MAX_TOKENS: Record<Tier, number> = { fast: 320, balanced: 420, deep: 800 }
const HEDGE_AFTER_MS = 4000
const WINDOW_TOKENS = 800
const WINDOW_LINES = 6
/** The SAY section has started and its first line has content: the user can read the headline. */
const SAY_VISIBLE = /\[SAY\][ \t]*\r?\n?[ \t]*\S/

/** [PROOF] is a behavioural-answer section (the prompt only asks for it there); a model adding it elsewhere gets it dropped. */
const onlyBehaviouralProof = <T extends { proof: unknown[] }>(p: T, type: DetectedQuestion['type']): T => (type === 'behavioural' ? p : { ...p, proof: [] })
/** The raw model reply as logged: the start of it, never the whole thing. */
const clip = (t: string, n = 1500): string => (t.length > n ? `${t.slice(0, n)}…[+${t.length - n} chars]` : t)

/** A broken or unbound question base must never cost an answer. */
const safeKb = (f: NonNullable<EngineDeps['kbMatch']>, jobId: string, q: string): KbMatch[] => { try { return f(jobId, q) } catch { return [] } }

/** A model that returns nothing, or text without the [SAY] section (a free model leaking its reasoning), fails like a server error so failover tries the next model.
 *  Items are held until the marker shows up, so nothing counts as "started" (and nothing is shown) before then. */
async function* requireFormat(src: AsyncIterable<StreamItem>, model: string): AsyncGenerator<StreamItem> {
  const held: StreamItem[] = []
  let text = ''
  let ok = false
  for await (const item of src) {
    if (ok) { yield item; continue }
    held.push(item)
    if ('delta' in item) text += item.delta
    if (/\[SAY\]/i.test(text)) { ok = true; yield* held; held.length = 0 }
  }
  if (!ok) debugLog('engine', 'bad reply', { model, chars: text.length, raw: clip(text) })
  if (!ok) throw new LlmError('server', text.trim() ? `${model} did not answer in the required format` : `${model} returned an empty answer`)
}

export function createAnswerEngine(deps: EngineDeps): AnswerEngine {
  const now = deps.now ?? Date.now
  const cost = deps.cost ?? createCostMeter()
  const active = new Set<AbortController>()
  const gap = deps.partialEveryMs ?? 80
  const isVision = deps.isVision ?? recVision

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
      const tier = req.route?.tier ?? pickTier(cfg.engine, req.question.type, req.kind)
      const model = tierModel(cfg.engine, tier)
      const noVision = req.image ? checkVision(model, tier, isVision) : null
      if (noVision) throw noVision // never drop the image silently
      const g = await deps.grounding()
      const mask = cfg.privacy.redact ? createRedactor(deps.redactNames?.() ?? []) : (t: string) => t
      const lines = windowLines(req.transcript, WINDOW_TOKENS, { maxLines: WINDOW_LINES }).map(l => ({ ...l, text: mask(l.text) }))
      const question = { ...req.question, text: mask(req.question.text) }
      const kbStartAt = now()
      const kb = deps.kbMatch && req.route?.variant !== 'brief' ? safeKb(deps.kbMatch, g.summary.jobId, question.text) : []
      const kbDoneAt = now()
      const prompt = buildPrompt({ grounding: g.prefix, coaching: cfg.coaching, question, transcript: lines, kind: req.kind, variant: req.route?.variant, kb })
      const promptChars = prompt.system.length + prompt.messages.reduce((n, m) => n + m.content.length, 0)
      const messages = req.image ? prompt.messages.map(m => ({ ...m, content: userContentWithImage(m.content, req.image!.jpeg) })) : prompt.messages
      const shot = req.image && { captureMs: req.image.captureMs ?? 0, encodeMs: req.image.encodeMs ?? 0, bytes: req.image.jpeg.length }
      const turnInfo = (): TurnInfo | undefined => shot ? { ...(req.info ?? { kind: req.route?.kind ?? (req.question.type === 'coding' || req.question.type === 'system-design' ? req.question.type : 'behavioural'), tier, auto: req.question.auto, spec: null, gate: null, gateMs: null }), shot } : req.info

      debugLog('engine', 'request', { question: question.id, model, tier, promptChars, kb: kb.length, image: Boolean(req.image), groundingChars: g.prefix.length })
      const start = now()
      const turn = deps.trace?.start(req.question.id, req.marks ?? {}, start)
      const marks: TraceMarks = req.marks ?? {} // shared with the caller: a speculative request learns its speech end after it started
      if (deps.kbMatch) { marks.kbStartAt = kbStartAt; marks.kbDoneAt = kbDoneAt; turn?.mark('kbStartAt', kbStartAt); turn?.mark('kbDoneAt', kbDoneAt) }
      const kbRefs = kb.map(({ outline: _o, ...ref }) => ref)
      const mark = (k: keyof TraceMarks): void => { marks[k] ??= now(); turn?.mark(k, marks[k]!) }
      let text = ''
      let firstTokenMs: number | null = null
      let usage: StreamUsage | null = null
      let usedModel = model
      const base: Suggestion = { questionId: req.question.id, model, tier, say: '', bullets: [], star: null, proof: [], flags: [], done: false, firstTokenMs: null, totalMs: null, costUsd: null }
      const snapshot = (done: boolean): Suggestion => ({ ...base, ...(kbRefs.length ? { kb: kbRefs } : {}), model: usedModel, ...onlyBehaviouralProof(parseSuggestion(text, done), req.question.type), done, firstTokenMs, totalMs: done ? now() - start : null, trace: stageMs(marks, { promptTokens: usage?.promptTokens, cachedTokens: usage?.cachedTokens }, turnInfo()) })

      const maxTokens = Math.round(MAX_TOKENS[tier] * (req.route?.maxTokensScale ?? 1))
      const call = (m: string, signal: AbortSignal): AsyncGenerator<StreamItem> => requireFormat(deps.provider.stream({ system: prompt.system, messages, model: m, signal, maxTokens, sessionId: deps.sessionId?.(), onMark: k => { debugLog('engine', k, { model: m }); mark(k === 'first-byte' ? 'firstByteAt' : 'requestSentAt') } }), m)
      const hedgeAfterMs = deps.hedgeAfterMs ?? HEDGE_AFTER_MS
      const stream = withFailover(modelOrder(model, fallbacksFor(cfg.engine.provider, tier, model, req.image ? isVision : undefined)), (m, others) => {
        usedModel = m
        return withHedge(m, others.find(o => o !== m), call, { afterMs: hedgeAfterMs, signal: ac.signal, onWin: w => { usedModel = w }, onHedge: b => debugLog('engine', 'hedge', { slow: m, backup: b }) })
      }, { signal: ac.signal, sleep: deps.sleep, onRetry: i => { debugLog('engine', 'retry', i); deps.onRetry?.(i) } })

      let lastYield = -Infinity
      try {
        for await (const item of stream) {
          if ('usage' in item) { usage = item.usage; continue }
          firstTokenMs ??= now() - start
          mark('firstTokenAt')
          text += item.delta
          if (marks.firstSayAt === undefined && SAY_VISIBLE.test(text)) mark('firstSayAt')
          if (now() - lastYield >= gap) { lastYield = now(); yield snapshot(false) }
        }
      } catch (e) {
        if (ac.signal.aborted || (e instanceof LlmError && e.code === 'aborted')) return // superseded or stopped: say nothing more
        if (text) yield snapshot(false) // keep what the user is already reading; the caller surfaces the error
        // Offer, never apply: the user decides whether a different model (and its data policy) is acceptable.
        if (e instanceof LlmError && (e.code === 'policy' || e.code === 'model_unavailable')) e.suggestion = fallbacksFor(cfg.engine.provider, tier, usedModel)[0]
        throw e
      }
      if (ac.signal.aborted) return

      const promptTokens = usage?.promptTokens ?? Math.ceil(promptChars / 4)
      const completionTokens = usage?.completionTokens ?? estimateTokens(text)
      const costUsd = cost.add(usedModel, promptTokens, completionTokens, usage?.costUsd ?? null, usage?.cachedTokens)
      mark('doneAt')
      debugLog('engine', 'reply', { question: req.question.id, model: usedModel, chars: text.length, ms: now() - start, raw: clip(text) })
      const record = (): void => {
        if (!turn) return
        for (const k of Object.keys(marks) as Array<keyof TraceMarks>) turn.mark(k, marks[k]!) // late marks (speech end, release)
        turn.finish({ promptTokens, cachedTokens: usage?.cachedTokens ?? null }, turnInfo())
      }
      if (req.afterRelease) void req.afterRelease.then(record); else record()
      const final = snapshot(true)
      const guarded = guardSuggestion({ cv: g.cv, stories: g.storiesText, known: [...g.known, req.question.text] }, final, { factCheck: cfg.engine.factCheck })
      yield { ...guarded, costUsd }
    } finally {
      req.signal.removeEventListener('abort', onAbort)
      active.delete(ac)
    }
  }

  return { answer, cancelAll() { for (const c of active) c.abort() }, warm: async () => { await deps.provider.warm?.() } }
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
