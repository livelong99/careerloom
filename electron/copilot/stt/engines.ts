import type { CopilotConfig, SttEngineId, SttModelInfo } from '../types'
import type { SttAdapter } from './adapter'
import { fasterWhisperAdapter } from './faster-whisper'
import { usableGpu } from './gpu'
import { moonshineAdapter } from './moonshine'
import { defaultEngine, defaultModel, findSttRuntime, MODEL_SIZE_MB, STT_MODELS } from './runtime'
import { whisperAdapter } from './whisper-mlx'

/** Adapter for the configured engine (S2: Whisper small is the default on Apple silicon, Moonshine the fallback). */
export function createSttAdapter(stt: CopilotConfig['stt']): SttAdapter {
  switch (stt.engine) {
    case 'moonshine': return moonshineAdapter(stt.model ?? defaultModel('moonshine'), stt.device)
    case 'whisper-mlx': return whisperAdapter(stt.model ?? defaultModel('whisper-mlx'))
    case 'faster-whisper': return fasterWhisperAdapter(stt.model ?? defaultModel('faster-whisper'), stt.device)
  }
}

/** One row per installable model; `recommended` marks the S2 default for this machine. MLX runs on the Apple GPU, so only Auto is offered for it; faster-whisper offers CPU and, with a usable NVIDIA GPU, CUDA. */
export function listSttModels(cfg: CopilotConfig['stt'], recommended: SttEngineId = defaultEngine(), cuda = usableGpu() !== null): SttModelInfo[] {
  return (['whisper-mlx', 'faster-whisper', 'moonshine'] as const).flatMap(engine => {
    const installed = findSttRuntime(engine)?.models ?? []
    const pick = cfg.model ?? defaultModel(engine)
    return STT_MODELS[engine].map((model): SttModelInfo => ({
      engine, model, sizeMb: MODEL_SIZE_MB[`${engine}:${model}`] ?? null, installed: installed.includes(model),
      devices: engine === 'moonshine' ? ['cpu'] : engine === 'faster-whisper' ? (cuda ? ['cpu', 'cuda'] : ['cpu']) : [],
      lastBenchmark: cfg.engine === engine && pick === model ? cfg.lastBenchmark : null,
      recommended: engine === recommended && model === defaultModel(engine, cuda),
    }))
  })
}
