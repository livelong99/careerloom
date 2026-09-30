import type { CopilotConfig, SttModelInfo } from '../types'
import type { SttAdapter } from './adapter'
import { DEFAULT_MOONSHINE_MODEL, findSttRuntime, MOONSHINE_MODELS } from './runtime'
import { moonshineAdapter } from './moonshine'

/** Adapter for the configured engine. Whisper MLX / faster-whisper stay behind this switch until the S2 bake-off picks them. */
export function createSttAdapter(stt: CopilotConfig['stt']): SttAdapter {
  switch (stt.engine) {
    case 'moonshine': return moonshineAdapter(stt.model ?? DEFAULT_MOONSHINE_MODEL, stt.device)
    default: throw new Error(`${stt.engine} is not available yet — choose Moonshine in Transcription`)
  }
}

export function listSttModels(cfg: CopilotConfig['stt']): SttModelInfo[] {
  const installed = findSttRuntime('moonshine')?.models ?? []
  const pick = cfg.model ?? DEFAULT_MOONSHINE_MODEL
  return MOONSHINE_MODELS.map(model => ({
    engine: 'moonshine' as const, model, sizeMb: null, installed: installed.includes(model), devices: ['cpu' as const],
    lastBenchmark: cfg.engine === 'moonshine' && pick === model ? cfg.lastBenchmark : null, recommended: model === DEFAULT_MOONSHINE_MODEL,
  }))
}
