// NVIDIA Parakeet TDT 0.6B v3 (ONNX int8, CPU) behind the streaming SttAdapter contract, mirroring faster-whisper.ts:
// main owns VAD + chunking (buffer.ts), the python sidecar only decodes (parakeet-script.ts).
import os from 'node:os'

import type { SttAdapter } from './adapter'
import { createChunkedAdapter } from './buffer'
import { spawnSidecarChild } from './child'
import { createSidecarDecoder } from './decoder'
import { findSttRuntime, PARAKEET_MODELS, STT_NOT_INSTALLED, type SttRuntime } from './runtime'

export function parakeetAdapter(model: string, rt: SttRuntime | null = findSttRuntime('parakeet')): SttAdapter {
  const m = PARAKEET_MODELS[model as keyof typeof PARAKEET_MODELS]
  if (!m) throw new Error(`Unknown Parakeet model: ${model}`)
  return createChunkedAdapter({
    id: 'parakeet',
    decoder: createSidecarDecoder({
      spawn() {
        if (!rt?.models.includes(model)) throw new Error(STT_NOT_INSTALLED)
        return spawnSidecarChild(rt, { HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', PYTHONUNBUFFERED: '1' })
      },
      config: () => ({ repo: m.repo, rev: m.rev, cache: rt?.cache, cpu_threads: Math.min(8, Math.max(4, Math.floor(os.cpus().length / 2))) }),
    }),
  })
}
