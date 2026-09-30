// Latency/RTF summary shared by the in-app benchmark and the tests (plan §3.2 "Benchmark on this machine").
import type { SttBenchmark } from '../types'

export function percentile(values: number[], p: number): number {
  if (!values.length) return 0
  const s = [...values].sort((a, b) => a - b)
  const i = (s.length - 1) * p, lo = Math.floor(i), hi = Math.ceil(i)
  return s[lo]! + (s[hi]! - s[lo]!) * (i - lo)
}

export type BenchRun = { finalLatenciesMs: number[]; audioMs: number; wallMs: number; ramMb: number | null }
export function summarise(r: BenchRun): Omit<SttBenchmark, 'at' | 'wer'> & { p95FinalMs: number } {
  return {
    p50FinalMs: percentile(r.finalLatenciesMs, 0.5), p95FinalMs: percentile(r.finalLatenciesMs, 0.95),
    realTimeFactor: r.audioMs ? r.wallMs / r.audioMs : 0, ramMb: r.ramMb,
  }
}

const words = (t: string) => t.toLowerCase().replace(/-/g, ' ').replace(/[^a-z0-9' ]+/g, ' ').split(/\s+/).filter(Boolean)

/** Word error rate (0..1+): word-level edit distance over the reference length, punctuation and case ignored. */
export function werOf(ref: string, hyp: string): number {
  const r = words(ref), h = words(hyp)
  if (!r.length) return h.length ? 1 : 0
  let prev = Array.from({ length: h.length + 1 }, (_, j) => j)
  for (let i = 1; i <= r.length; i++) {
    const cur = [i]
    for (let j = 1; j <= h.length; j++) cur[j] = Math.min(prev[j]! + 1, cur[j - 1]! + 1, prev[j - 1]! + (r[i - 1] === h[j - 1] ? 0 : 1))
    prev = cur
  }
  return prev[h.length]! / r.length
}
