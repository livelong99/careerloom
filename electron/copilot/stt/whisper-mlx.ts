// Whisper on MLX (Apple silicon) behind the streaming SttAdapter contract: main owns VAD + chunking (buffer.ts), the python
// sidecar only decodes (whisper-script.ts). Weights are loaded from the pinned local snapshot with HF_HUB_OFFLINE=1.
import type { SttAdapter } from './adapter'
import { createChunkedAdapter } from './buffer'
import { spawnSidecarChild } from './child'
import { createSidecarDecoder } from './decoder'
import { findSttRuntime, STT_NOT_INSTALLED, WHISPER_MODELS, type SttRuntime } from './runtime'

export function whisperAdapter(model: string, rt: SttRuntime | null = findSttRuntime('whisper-mlx')): SttAdapter {
  const m = WHISPER_MODELS[model as keyof typeof WHISPER_MODELS]
  if (!m) throw new Error(`Unknown Whisper model: ${model}`)
  return createChunkedAdapter({
    id: 'whisper-mlx',
    decoder: createSidecarDecoder({
      spawn() {
        if (!rt?.models.includes(model)) throw new Error(STT_NOT_INSTALLED)
        return spawnSidecarChild(rt, { HF_HUB_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', PYTHONUNBUFFERED: '1' })
      },
      config: o => ({ repo: m.repo, rev: m.rev, cache: rt?.cache, language: o.language, vocab: o.vocab }),
    }),
  })
}
