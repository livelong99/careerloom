// Per-turn latency trace (PERF-1): absolute stage timestamps in a small ring buffer, reduced to numbers-only deltas.
// Never holds transcript or answer text, so it is safe to log and to persist with a session.
export type TraceMarks = { speechEndAt?: number; sttFinalAt?: number; detectedAt?: number; requestSentAt?: number; firstByteAt?: number; firstTokenAt?: number; firstSayAt?: number; doneAt?: number; kbStartAt?: number; kbDoneAt?: number
  /** A held (speculative) answer was handed to the overlay: the answer is visible no earlier than this. */
  releasedAt?: number }
/** Closed-set labels and numbers only (PERF-2): how the turn was routed and started. */
export type TurnInfo = { kind: 'coding' | 'system-design' | 'behavioural' | 'factual' | 'small-talk'; tier: 'fast' | 'balanced' | 'deep'; auto: boolean; spec: 'hit' | 'miss' | null; gate: 'heuristic' | 'jev' | null; gateMs: number | null
  /** Screenshot attached to this turn: capture and encode times, size on the wire (upload shows in `connect`). */
  shot?: { captureMs: number; encodeMs: number; bytes: number } }
export type StageMs = { stt: number | null; detect: number | null; connect: number | null; ttft: number | null; firstSay: number | null; endToSay: number | null; total: number | null; promptTokens: number | null; cachedTokens: number | null; turn?: TurnInfo
  /** Question-base retrieval for this turn (ms); absent when the base was not consulted. */
  kb?: number }
export type TraceRecord = { questionId: string; startedAt: number; marks: TraceMarks; ms: StageMs }
export type Stat = { p50: number; p95: number } | null
export type TraceSummary = { turns: number; ttft: Stat; firstSay: Stat; endToSay: Stat; total: Stat; cacheHitRate: number | null; speculation: { hits: number; misses: number } | null }

const diff = (a?: number, b?: number): number | null => (a === undefined || b === undefined ? null : Math.max(0, b - a))

export function stageMs(m: TraceMarks, tokens: { promptTokens?: number | null; cachedTokens?: number | null } = {}, turn?: TurnInfo): StageMs {
  const visibleAt = m.firstSayAt !== undefined && m.releasedAt !== undefined ? Math.max(m.firstSayAt, m.releasedAt) : m.firstSayAt
  return {
    stt: diff(m.speechEndAt, m.sttFinalAt), detect: diff(m.sttFinalAt, m.detectedAt),
    connect: diff(m.requestSentAt, m.firstByteAt), ttft: diff(m.requestSentAt, m.firstTokenAt), firstSay: diff(m.requestSentAt, m.firstSayAt),
    endToSay: diff(m.speechEndAt, visibleAt), total: diff(m.requestSentAt, m.doneAt),
    promptTokens: tokens.promptTokens ?? null, cachedTokens: tokens.cachedTokens ?? null,
    ...(turn ? { turn } : {}),
    ...(m.kbStartAt !== undefined && m.kbDoneAt !== undefined ? { kb: Math.max(0, m.kbDoneAt - m.kbStartAt) } : {}),
  }
}

export function percentile(xs: number[], p: number): number | null {
  if (!xs.length) return null
  const s = [...xs].sort((a, b) => a - b)
  return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)]!
}
const stat = (xs: Array<number | null | undefined>): Stat => {
  const v = xs.filter((x): x is number => typeof x === 'number')
  return v.length ? { p50: percentile(v, 0.5)!, p95: percentile(v, 0.95)! } : null
}

export function summarizeTraces(list: Array<Partial<StageMs>>): TraceSummary {
  const prompt = list.reduce((n, x) => n + (x.promptTokens ?? 0), 0)
  const cached = list.reduce((n, x) => n + (x.cachedTokens ?? 0), 0)
  const spec = list.flatMap(x => (x.turn?.spec ? [x.turn.spec] : []))
  return { turns: list.length, ttft: stat(list.map(x => x.ttft)), firstSay: stat(list.map(x => x.firstSay)), endToSay: stat(list.map(x => x.endToSay)), total: stat(list.map(x => x.total)), cacheHitRate: prompt > 0 ? cached / prompt : null, speculation: spec.length ? { hits: spec.filter(x => x === 'hit').length, misses: spec.filter(x => x === 'miss').length } : null }
}

export type TurnTrace = {
  mark(stage: keyof TraceMarks, at: number): void
  snapshot(): TraceMarks
  finish(tokens?: { promptTokens?: number | null; cachedTokens?: number | null }, turn?: TurnInfo): TraceRecord
}
export interface TraceLog {
  start(questionId: string, marks: TraceMarks, startedAt: number): TurnTrace
  last(): TraceRecord | undefined
  all(): TraceRecord[]
}

/** `sink` receives each finished turn as one JSON line of numbers (the metrics log). */
export function createTraceLog(capacity = 200, sink?: (line: string) => void): TraceLog {
  const ring: TraceRecord[] = []
  return {
    start(questionId, initial, startedAt) {
      const marks: TraceMarks = { ...initial }
      let rec: TraceRecord | null = null
      return {
        mark(stage, at) { marks[stage] ??= at },
        snapshot: () => ({ ...marks }),
        finish(tokens, turn) {
          if (rec) return rec
          rec = { questionId, startedAt, marks: { ...marks }, ms: stageMs(marks, tokens, turn) }
          ring.push(rec)
          if (ring.length > capacity) ring.shift()
          sink?.(JSON.stringify({ at: startedAt, ...rec.ms }))
          return rec
        },
      }
    },
    last: () => ring[ring.length - 1],
    all: () => [...ring],
  }
}
