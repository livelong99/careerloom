import type { GateInput, GateVerdict, QuestionGate } from './types'

export type GateStats = { modelCalls: number; timeouts: number; fallbacks: number; rtt: { p50: number | null; p95: number | null } }
export const GATE_TIMEOUT_MS = 600

const pct = (xs: number[], p: number): number | null => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(p * xs.length) - 1)]! : null)

/** Heuristic first (zero latency). Only an unsure interviewer line reaches the model, under a hard timeout; any failure
 *  returns the heuristic verdict. Never throws and never delays the manual answer path (which does not use the gate). */
export function createGatePipeline(o: { heuristic: QuestionGate; model?: QuestionGate | null; timeoutMs?: number }): QuestionGate & { stats(): GateStats } {
  const timeoutMs = o.timeoutMs ?? GATE_TIMEOUT_MS
  let modelCalls = 0, timeouts = 0, fallbacks = 0
  const rtt: number[] = []
  return {
    id: o.model?.id ?? 'heuristic',
    async decide(input: GateInput, signal?: AbortSignal): Promise<GateVerdict> {
      const h = await o.heuristic.decide(input, signal)
      if (h.isQuestion !== null || !o.model || input.speaker !== 'interviewer') return h
      modelCalls++
      const ac = new AbortController()
      const onAbort = () => ac.abort()
      signal?.addEventListener('abort', onAbort, { once: true })
      let timer: ReturnType<typeof setTimeout> | undefined
      try {
        const timedOut = new Promise<'timeout'>(r => { timer = setTimeout(() => r('timeout'), timeoutMs) })
        const m = await Promise.race([o.model.decide(input, ac.signal), timedOut])
        if (m === 'timeout') { timeouts++; fallbacks++; return h }
        rtt.push(m.ms)
        if (m.isQuestion === null) { fallbacks++; return h }
        return m
      } catch { fallbacks++; return h } finally {
        clearTimeout(timer); ac.abort(); signal?.removeEventListener('abort', onAbort)
      }
    },
    stats: () => ({ modelCalls, timeouts, fallbacks, rtt: { p50: pct(rtt, 0.5), p95: pct(rtt, 0.95) } }),
  }
}
