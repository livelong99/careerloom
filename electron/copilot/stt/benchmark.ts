// copilotBenchmarkStt backend: validate the selection, refuse while a live session holds the model (16 GB: one model at
// a time), run the fixture (bench-run.ts), keep the result as the configured model's "last benchmark".
import type { CopilotConfig, SttBenchmark, SttDevice, SttEngineId } from '../types'
import type { SttAdapter } from './adapter'
import { loadFixture, type BenchFixture } from './bench-fixture'
import { runBenchmark, type BenchClock } from './bench-run'
import { defaultModel, STT_MODELS } from './runtime'

export type Selection = { engine: Exclude<SttEngineId, 'faster-whisper'>; model: string; device: SttDevice }
const DEVICES: SttDevice[] = ['auto', 'cpu', 'coreml', 'cuda']
export const BENCH_BUDGET_MS = 60_000

export function parseSelection(raw: unknown): Selection {
  const s = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>
  if (s.engine !== 'moonshine' && s.engine !== 'whisper-mlx') throw new Error('That speech engine cannot be benchmarked here')
  if (typeof s.model !== 'string' || !STT_MODELS[s.engine].includes(s.model)) throw new Error('Unknown speech model')
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

export async function benchmarkStt(raw: unknown, d: BenchDeps): Promise<SttBenchmark> {
  const sel = parseSelection(raw)
  if (d.busy()) throw new Error('Stop the running session before running the benchmark')
  if (!d.installed(sel.engine, sel.model)) throw new Error('Install the speech model first, then run the benchmark')
  const stt = { ...d.cfg, ...sel, lastBenchmark: null }
  const budget = d.budgetMs ?? BENCH_BUDGET_MS
  let timer: ReturnType<typeof setTimeout> | undefined
  const limit = new Promise<never>((_, reject) => { timer = setTimeout(() => { d.kill(); reject(new Error('The benchmark took too long and was stopped')) }, budget) })
  try {
    const result = await Promise.race([(async () => runBenchmark({ make: () => d.make(stt), fixture: await (d.fixture ?? loadFixture)(), endSilenceMs: d.cfg.endSilenceMs, clock: d.clock }))(), limit])
    if (sel.engine === d.cfg.engine && sel.model === (d.cfg.model ?? defaultModel(sel.engine))) d.save(result)
    return result
  } finally { clearTimeout(timer) }
}
