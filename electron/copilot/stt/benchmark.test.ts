import { describe, expect, it, vi } from 'vitest'

import type { SttBenchmark } from '../types'
import { benchmarkStt, parseSelection } from './benchmark'
import { killSttSidecars } from './child'
import { createSttAdapter } from './engines'
import { createFakeAdapter } from './fake'
import { findSttRuntime } from './runtime'

const CFG = { engine: 'whisper-mlx' as const, model: null, device: 'auto' as const, language: 'en' as const, lastBenchmark: null, endSilenceMs: 650, vocab: [] }
const fixture = { pcm: new Int16Array(16 * 3000), refText: 'hello there', utterances: [{ text: 'hello there', endMs: 1000 }] }
const events = [{ atMs: 1700, ev: 'final' as const, text: 'hello there', t0: 0, t1: 1700 }]
const base = () => ({
  cfg: CFG, busy: () => false, installed: () => true, fixture: () => fixture,
  make: () => createFakeAdapter(events), save: vi.fn<(b: SttBenchmark) => void>(), clock: undefined, kill: vi.fn(),
})

describe('parseSelection', () => {
  it('accepts an installable engine/model/device and rejects the rest', () => {
    expect(parseSelection({ engine: 'whisper-mlx', model: 'turbo', device: 'auto' })).toEqual({ engine: 'whisper-mlx', model: 'turbo', device: 'auto' })
    expect(() => parseSelection({ engine: 'whisper-mlx', model: 'huge', device: 'auto' })).toThrow(/model/)
    expect(() => parseSelection({ engine: 'faster-whisper', model: 'small', device: 'auto' })).toThrow(/engine/)
    expect(() => parseSelection({ engine: 'moonshine', model: 'small', device: 'tpu' })).toThrow(/device/)
    expect(() => parseSelection(null)).toThrow()
  })
})

describe('benchmarkStt', () => {
  it('runs the selection and stores the result when it is the configured engine and model', async () => {
    const d = base()
    const r = await benchmarkStt({ engine: 'whisper-mlx', model: 'small', device: 'auto' }, { ...d, clock: { now: () => 0, sleepUntil: async () => {} } })
    expect(r.wer).toBe(0)
    expect(d.save).toHaveBeenCalledWith(r)
  })
  it('does not store a result for a model other than the configured one', async () => {
    const d = base()
    await benchmarkStt({ engine: 'whisper-mlx', model: 'turbo', device: 'auto' }, { ...d, clock: { now: () => 0, sleepUntil: async () => {} } })
    expect(d.save).not.toHaveBeenCalled()
  })
  it('refuses while a session runs or when the model is not installed', async () => {
    await expect(benchmarkStt({ engine: 'whisper-mlx', model: 'small', device: 'auto' }, { ...base(), busy: () => true })).rejects.toThrow(/stop the running session/i)
    await expect(benchmarkStt({ engine: 'whisper-mlx', model: 'small', device: 'auto' }, { ...base(), installed: () => false })).rejects.toThrow(/install/i)
  })
  it('gives up after the budget, killing the sidecar', async () => {
    const d = base()
    const never = { ...createFakeAdapter([]), start: () => new Promise<void>(() => {}) }
    await expect(benchmarkStt({ engine: 'whisper-mlx', model: 'small', device: 'auto' }, { ...d, make: () => never, budgetMs: 20 })).rejects.toThrow(/too long/i)
    expect(d.kill).toHaveBeenCalled()
  })
})

// Live (local model, $0): CL_LIVE_STT=1 + an install of whisper small under CAREERLOOM_STT_DIR; speaks the fixture with macOS `say`.
describe.skipIf(process.env.CL_LIVE_STT !== '1' || !findSttRuntime('whisper-mlx')?.models.includes('small'))('benchmarkStt (live whisper small)', () => {
  it('measures latency, real-time factor and WER on the synthetic fixture', async () => {
    const r = await benchmarkStt({ engine: 'whisper-mlx', model: 'small', device: 'auto' }, { ...base(), make: createSttAdapter, fixture: undefined, save: vi.fn(), kill: killSttSidecars })
    console.info(`[live benchmark whisper-mlx/small] ${JSON.stringify(r)}`)
    expect(r.p50FinalMs).toBeGreaterThan(300); expect(r.p50FinalMs).toBeLessThan(3000)
    expect(r.wer).toBeLessThan(0.3)
  }, 90_000)
})
