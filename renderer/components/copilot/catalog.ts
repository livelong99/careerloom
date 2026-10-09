// What the pickers show when main's module (WP3 STT list, WP2 LLM list) is not wired or the OpenRouter list is offline.
// Sizes/latencies are deliberately absent: they are measured (benchmark) or reported by the engine, never guessed here.
import type { SttDevice, SttEngineId } from '@/lib/types'

export type SttCatalogModel = { id: string; label: string; hint: string; recommended?: boolean }
/** Hints quote the S2 bake-off (plan §3.2): computer-generated speech, time from the end of a sentence to its text. Real calls are noisier; Benchmark measures this computer. */
export const STT_ENGINES: ReadonlyArray<{ id: SttEngineId; label: string; hint: string; models: SttCatalogModel[]; devices: Array<Exclude<SttDevice, 'auto'>> }> = [
  {
    id: 'parakeet', label: 'NVIDIA Parakeet (Windows and Linux)', hint: 'Default on Windows and Linux. Writes each sentence once you pause, in one piece even for a long question, and is accurate on technical words. Runs on the CPU (no GPU or CUDA needed); installs small Python packages plus a model of about 640 MB. Supports 25 European languages.',
    devices: ['cpu'],
    models: [{ id: 'v3', label: 'Parakeet TDT 0.6B v3', hint: 'default · int8 · runs several times faster than real time on a CPU', recommended: true }],
  },
  {
    id: 'hf', label: 'Hugging Face model', hint: 'Any public speech-recognition model from Hugging Face (safetensors, no custom code), added in Settings → Local models. Runs on this computer with PyTorch (Apple GPU, NVIDIA GPU or CPU). Installs about 1 GB of Python packages plus the model.',
    devices: ['cpu', 'cuda'],
    models: [{ id: 'nvidia/nemotron-3.5-asr-streaming-0.6b', label: 'NVIDIA Nemotron 3.5 ASR (0.6B)', hint: 'curated · 40 locales · OpenMDW-1.1 licence · measure speed with Benchmark' }],
  },
  {
    id: 'whisper-mlx', label: 'Whisper (Apple silicon)', hint: 'Default on Apple silicon. Writes each sentence once you pause, about a second after the question ends. The first install is large because Whisper needs PyTorch (about 1.3 GB on top of the model).',
    devices: [],
    models: [
      { id: 'small', label: 'Small', hint: 'default · text about 0.8 s after you stop · accurate on technical words', recommended: true },
      { id: 'turbo', label: 'Turbo · most accurate (on demand)', hint: 'about 1.5 s or slower · best used when you press Answer after the question' },
    ],
  },
  {
    id: 'moonshine', label: 'Moonshine (streaming)', hint: 'Fallback that also works on Intel Macs. Shows words while the person is still talking, but mishears technical words more often.',
    devices: ['cpu', 'coreml'],
    models: [
      { id: 'tiny', label: 'Tiny', hint: 'fastest · about 0.7 s · lower accuracy' },
      { id: 'small', label: 'Small', hint: 'fallback · about 0.8 s with fast updates · balanced', recommended: true },
      { id: 'medium', label: 'Medium', hint: 'about 1 s · most accurate of the three' },
    ],
  },
  {
    id: 'faster-whisper', label: 'Whisper (NVIDIA GPU)', hint: 'Default on Windows and Linux with an NVIDIA GPU. Runs Whisper on the GPU (CUDA), no CUDA toolkit to install; falls back to the CPU if the GPU cannot be used. Installs about 1.3 GB of NVIDIA libraries.',
    devices: ['cpu', 'cuda'],
    models: [
      { id: 'turbo', label: 'Turbo · most accurate', hint: 'default with a GPU · large-v3-turbo · measure speed with Benchmark', recommended: true },
      { id: 'distil', label: 'Distil · English, a little faster', hint: 'distil-large-v3 · fewer decoder layers, similar accuracy on short sentences' },
      { id: 'small', label: 'Small · CPU fallback', hint: 'small English model · light enough for a CPU' },
    ],
  },
]
export const DEVICE_LABEL: Record<SttDevice, string> = { auto: 'Auto', cpu: 'CPU', coreml: 'Apple Neural Engine (CoreML)', cuda: 'NVIDIA GPU (CUDA)' }

export const TIERS = [
  { id: 'fast', label: 'Fast', hint: 'Small model. First words in about a second.' },
  { id: 'balanced', label: 'Balanced', hint: 'Mid-size model. Better structure, a little slower.' },
  { id: 'deep', label: 'Deep', hint: 'Largest model. For system design and coding.' },
] as const
export type TierId = (typeof TIERS)[number]['id']
