// copilotBenchmarkStt backend: validate the selection, refuse while a live session holds the model (16 GB: one model at
// a time), run the fixture (bench-run.ts), keep the result as the configured model's "last benchmark".
import type { CopilotConfig, SttBenchmark, SttDevice, SttEngineId } from '../types'
import type { SttAdapter } from './adapter'
import { percentile } from './bench'
import { loadFixture, type BenchFixture } from './bench-fixture'
import { runBenchmark, type BenchClock } from './bench-run'
import { readFwTrace, resetFwTrace } from './faster-whisper'
import { isHfModel } from './hf-models'
import { defaultModel, STT_MODELS } from './runtime'

export type Selection = { engine: SttEngineId; model: string; device: SttDevice }
const DEVICES: SttDevice[] = ['auto', 'cpu', 'coreml', 'cuda']
export const BENCH_BUDGET_MS = 60_000

export function parseSelection(raw: unknown): Selection {
  const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  if (s.engine !== 'moonshine' && s.engine !== 'whisper-mlx' && s.engine !== 'faster-whisper' && s.engine !== 'hf') throw new Error('That speech engine cannot be benchmarked here')
  if (typeof s.model !== 'string' || !(s.engine === 'hf' ? isHfModel(s.model) : STT_MODELS[s.engine].includes(s.model))) throw new Error('Unknown speech model')
  if (!DEVICES.includes(s.device as SttDevice)) throw new Error('Unknown compute device')
  return { engine: s.engine, model: s.model, device: s.device as SttDevice }
}

export type BenchDeps = {
  cfg: CopilotConfig['stt']
  busy(): boolean
  installed(engine: SttEngineId, model: string): boolean
  make(stt: CopilotConfig['stt']): SttAdapter
  fixture?(): BenchFixture | Promise<BenchFixture>
  save(b: SttBenchmark): void
  kill(): void
  clock?: BenchClock
  budgetMs?: number
}

/** faster-whisper only: which device really ran and the per-decode times (end-of-speech latency in `base` includes the endpoint wait). */
function withTrace(base: SttBenchmark): SttBenchmark {
  const t = readFwTrace()
  return { ...base, device: t.device ?? undefined, p50DecodeMs: t.decodeMs.length ? Math.round(percentile(t.decodeMs, 0.5)) : undefined, p95DecodeMs: t.decodeMs.length ? Math.round(percentile(t.decodeMs, 0.95)) : undefined }
}

export async function benchmarkStt(raw: unknown, d: BenchDeps): Promise<SttBenchmark> {
  const sel = parseSelection(raw)
  if (d.busy()) throw new Error('Stop the running session before running the benchmark')
  if (!d.installed(sel.engine, sel.model)) throw new Error('Install the speech model first, then run the benchmark')
  const stt = { ...d.cfg, ...sel, lastBenchmark: null }
  const budget = d.budgetMs ?? (sel.engine === 'faster-whisper' || sel.engine === 'hf' ? 2 * BENCH_BUDGET_MS : BENCH_BUDGET_MS) // faster-whisper: two passes = two CUDA model loads; hf: a first load of a large model
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => { timer = setTimeout(() => { d.kill(); reject(new Error('The benchmark took too long and was stopped')) }, budget) })
  try {
    resetFwTrace()
    const base = await Promise.race([(async () => runBenchmark({ make: () => d.make(stt), fixture: await (d.fixture ?? loadFixture)(), endSilenceMs: d.cfg.endSilenceMs, clock: d.clock }))(), limit])
    const result = sel.engine === 'faster-whisper' ? withTrace(base) : base
    if (sel.engine === d.cfg.engine && sel.model === (d.cfg.model ?? defaultModel(sel.engine))) d.save(result)
    return result
  } finally { clearTimeout(timer) }
}
