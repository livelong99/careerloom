// faster-whisper (CTranslate2, NVIDIA CUDA 12 or CPU int8) behind the streaming SttAdapter contract, mirroring whisper-mlx.ts:
// main owns VAD + chunking (buffer.ts), the python sidecar only decodes (faster-whisper-script.ts).
import os from 'node:os'

import type { SttDevice } from '../types'
import type { SttAdapter } from './adapter'
import { createChunkedAdapter, type Decoder } from './buffer'
import { spawnSidecarChild } from './child'
import { createSidecarDecoder } from './decoder'
import { computeTypeFor, usableGpu, type GpuInfo } from './gpu'
import { FASTER_WHISPER_MODELS, findSttRuntime, STT_NOT_INSTALLED, type SttRuntime } from './runtime'

/** auto = CUDA when a usable GPU and the CUDA wheels are there, else CPU int8; an explicit cuda is tried (the sidecar falls back and says why). */
export function resolveFasterWhisper(device: SttDevice, rt: SttRuntime | null, gpu: GpuInfo | null = usableGpu()): { device: 'cuda' | 'cpu'; computeType: string } {
  const cuda = rt?.cuda !== false && (device === 'cuda' || (device === 'auto' && gpu !== null))
  const d = cuda ? 'cuda' : 'cpu'
  return { device: d, computeType: computeTypeFor(d, gpu) }
}

/** What the last sidecar actually ran on, plus final-decode times, for the benchmark (module state: one session at a time, see benchmark.ts busy()). */
export type FwTrace = { device: 'cuda' | 'cpu' | null; reason: string | null; decodeMs: number[] }
let trace: FwTrace = { device: null, reason: null, decodeMs: [] }
export const resetFwTrace = () => { trace = { device: null, reason: null, decodeMs: [] } }
export const readFwTrace = (): FwTrace => ({ ...trace, decodeMs: [...trace.decodeMs] })

export const timed = (d: Decoder, now: () => number = () => performance.now()): Decoder => ({
  ...d,
  async decode(pcm, kind) {
    const t = now()
    try { return await d.decode(pcm, kind) } finally { if (kind === 'final') trace.decodeMs.push(now() - t) }
  },
})

export function fasterWhisperAdapter(model: string, device: SttDevice, rt: SttRuntime | null = findSttRuntime('faster-whisper'), gpu?: GpuInfo | null): SttAdapter {
  const m = FASTER_WHISPER_MODELS[model as keyof typeof FASTER_WHISPER_MODELS]
  if (!m) throw new Error(`Unknown faster-whisper model: ${model}`)
  const run = () => resolveFasterWhisper(device, rt, gpu)
  return createChunkedAdapter({
    id: 'faster-whisper',
    decoder: timed(createSidecarDecoder({
      spawn() {
        if (!rt?.models.includes(model)) throw new Error(STT_NOT_INSTALLED)
        return spawnSidecarChild(rt, { HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', PYTHONUNBUFFERED: '1' })
      },
      config: o => ({
        repo: m.repo, rev: m.rev, cache: rt?.cache, language: o.language, vocab: o.vocab,
        device: run().device, compute_type: run().computeType, cpu_threads: Math.min(8, Math.max(4, Math.floor(os.cpus().length / 2))),
      }),
      onReady: l => { trace = { ...trace, device: l.device === 'cuda' ? 'cuda' : 'cpu', reason: l.reason ?? null } },
    })),
  })
}
