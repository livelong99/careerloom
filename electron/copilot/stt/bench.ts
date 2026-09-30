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
