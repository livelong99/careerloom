// Any Hugging Face speech model (transformers ASR pipeline) behind the streaming SttAdapter contract, mirroring parakeet.ts:
// main owns VAD + chunking (buffer.ts), the python sidecar only decodes (hf-script.ts). The model id is `repo@<commit>`.
import type { SttDevice } from '../types'
import type { SttAdapter } from './adapter'
import { createChunkedAdapter, type Decoder } from './buffer'
import { spawnSidecarChild } from './child'
import { createSidecarDecoder } from './decoder'
import { LOOKAHEAD_MS, parseModelId, stripLangTags } from './hf-models'
import { DEFAULT_HF_OPTIONS, findSttRuntime, STT_NOT_INSTALLED, type SttRuntime } from './runtime'

export type HfOptions = { language: string; lookahead: keyof typeof LOOKAHEAD_MS }

export function hfAdapter(model: string, device: SttDevice, opts: HfOptions = DEFAULT_HF_OPTIONS, rt: SttRuntime | null = findSttRuntime('hf')): SttAdapter {
  const m = parseModelId(model)
  if (!m) throw new Error(`Unknown Hugging Face model: ${model}`)
  const inner = createSidecarDecoder({
    spawn() {
      if (!rt?.models.includes(model)) throw new Error(STT_NOT_INSTALLED)
      return spawnSidecarChild(rt, { HF_HUB_OFFLINE: '1', TRANSFORMERS_OFFLINE: '1', HF_HUB_DISABLE_TELEMETRY: '1', PYTHONUNBUFFERED: '1', PYTORCH_ENABLE_MPS_FALLBACK: '1' })
    },
    config: () => ({ repo: m.repo, rev: m.rev, cache: rt?.cache, device: device === 'cuda' || device === 'cpu' ? device : 'auto', language: opts.language, lookahead_ms: LOOKAHEAD_MS[opts.lookahead] }),
  })
  const decoder: Decoder = { ...inner, decode: async (pcm, kind) => stripLangTags(await inner.decode(pcm, kind)) }
  return createChunkedAdapter({ id: 'hf', decoder })
}
