import type { CopilotConfig, SttEngineId, SttModelInfo } from '../types'
import type { SttAdapter } from './adapter'
import { fasterWhisperAdapter } from './faster-whisper'
import { usableGpu } from './gpu'
import { hfAdapter } from './hf'
import { moonshineAdapter } from './moonshine'
import { parakeetAdapter } from './parakeet'
import { defaultEngine, defaultModel, findSttRuntime, MODEL_SIZE_MB, STT_MODELS } from './runtime'
import { whisperAdapter } from './whisper-mlx'

/** Adapter for the configured engine (S2: Whisper small is the default on Apple silicon, Moonshine the fallback). */
export function createSttAdapter(stt: CopilotConfig['stt']): SttAdapter {
  switch (stt.engine) {
    case 'moonshine': return moonshineAdapter(stt.model ?? defaultModel('moonshine'), stt.device)
    case 'whisper-mlx': return whisperAdapter(stt.model ?? defaultModel('whisper-mlx'))
    case 'faster-whisper': return fasterWhisperAdapter(stt.model ?? defaultModel('faster-whisper'), stt.device)
    case 'parakeet': return parakeetAdapter(stt.model ?? defaultModel('parakeet'))
    case 'hf': return hfAdapter(stt.model ?? defaultModel('hf'), stt.device, stt.hf)
  }
}

/** One row per installable model; `recommended` marks the S2 default for this machine. MLX runs on the Apple GPU, so only Auto is offered for it; faster-whisper offers CPU and, with a usable NVIDIA GPU, CUDA. */
export function listSttModels(cfg: CopilotConfig['stt'], recommended: SttEngineId = defaultEngine(), cuda = usableGpu() !== null): SttModelInfo[] {
  return (['parakeet', 'whisper-mlx', 'faster-whisper', 'moonshine', 'hf'] as const).flatMap(engine => {
    const installed = findSttRuntime(engine)?.models ?? []
    const pick = cfg.model ?? defaultModel(engine)
    const models = engine === 'hf' ? [...new Set([...STT_MODELS.hf, ...installed])] : STT_MODELS[engine] // hf: the curated entry plus every model the user added
    return models.map((model): SttModelInfo => ({
      engine, model, sizeMb: MODEL_SIZE_MB[`${engine}:${model}`] ?? null, installed: installed.includes(model),
      devices: engine === 'moonshine' || engine === 'parakeet' ? ['cpu'] : engine === 'faster-whisper' || engine === 'hf' ? (cuda ? ['cpu', 'cuda'] : ['cpu']) : [],
      lastBenchmark: cfg.engine === engine && pick === model ? cfg.lastBenchmark : null,
      recommended: engine === recommended && model === defaultModel(engine, cuda),
    }))
  })
}
