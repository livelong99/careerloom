// What the pickers show when main's module (WP3 STT list, WP2 LLM list) is not wired or the OpenRouter list is offline.
// Sizes/latencies are deliberately absent: they are measured (benchmark) or reported by the engine, never guessed here.
import type { SttDevice, SttEngineId } from '@/lib/types'

export type SttCatalogModel = { id: string; label: string; hint: string }
export const STT_ENGINES: ReadonlyArray<{ id: SttEngineId; label: string; hint: string; models: SttCatalogModel[]; devices: Array<Exclude<SttDevice, 'auto'>> }> = [
  {
    id: 'moonshine', label: 'Moonshine (streaming)', hint: 'Runs on this computer. Streaming engines show words while the person is still talking.',
    devices: ['cpu', 'coreml'],
    models: [
      { id: 'tiny-streaming', label: 'Tiny streaming', hint: 'fastest · lower accuracy' },
      { id: 'small-streaming', label: 'Small streaming', hint: 'balanced' },
      { id: 'medium-streaming', label: 'Medium streaming', hint: 'most accurate of the three' },
    ],
  },
  {
    id: 'whisper-mlx', label: 'Whisper (Apple silicon)', hint: 'Re-reads the audio every second or so. Slower to the first words, often more accurate.',
    devices: ['cpu'],
    models: [{ id: 'small', label: 'Small', hint: 'balanced' }, { id: 'turbo', label: 'Turbo', hint: 'most accurate' }],
  },
  {
    id: 'faster-whisper', label: 'faster-whisper', hint: 'Needs an NVIDIA GPU for real-time use; not available on this Mac.',
    devices: ['cpu', 'cuda'],
    models: [{ id: 'small', label: 'Small', hint: 'balanced' }],
  },
]
export const DEVICE_LABEL: Record<SttDevice, string> = { auto: 'Auto', cpu: 'CPU', coreml: 'Apple Neural Engine (CoreML)', cuda: 'NVIDIA GPU (CUDA)' }

export const TIERS = [
  { id: 'fast', label: 'Fast', hint: 'Small model. First words in about a second.' },
  { id: 'balanced', label: 'Balanced', hint: 'Mid-size model. Better structure, a little slower.' },
  { id: 'deep', label: 'Deep', hint: 'Largest model. For system design and coding.' },
] as const
export type TierId = (typeof TIERS)[number]['id']
