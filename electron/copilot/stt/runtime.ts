// Where the optional local STT install lives and whether a finished one is present (no electron imports).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { SttEngineId } from '../types'
import { usableGpu } from './gpu'

/** Pinned PyPI packages. Bump deliberately: the S2 numbers and licence check are for these versions. */
export const PINS = { moonshine: 'moonshine-voice==0.1.5', 'whisper-mlx': 'mlx-whisper==0.4.3', 'faster-whisper': 'faster-whisper==1.2.1', parakeet: 'onnx-asr==0.12.0', hf: 'transformers==5.19.0' } as const
/** CUDA 12 runtime for faster-whisper from pip wheels (no toolkit, no PyTorch). ctranslate2 4.6.0 is the CUDA 12 + cuDNN 9 build; the cuDNN 9.1 / cuBLAS 12.4 wheels are the matching pair. Bump all together with PINS['faster-whisper']. */
export const FASTER_WHISPER_PACKAGES = ['ctranslate2==4.6.0', 'setuptools==80.9.0'] as const /* ctranslate2 imports pkg_resources, which setuptools 81+ no longer ships */
export const FASTER_WHISPER_CUDA_PACKAGES = ['nvidia-cublas-cu12==12.4.5.8', 'nvidia-cudnn-cu12==9.1.0.70'] as const
/** CTranslate2 conversions (MIT weights), pinned by commit. turbo = large-v3-turbo (GPU default), distil = distil-large-v3 (English, 2 decoder layers), small = CPU fallback (English-only small.en, int8). */
export const FASTER_WHISPER_MODELS = {
  small: { repo: 'Systran/faster-whisper-small.en', rev: 'd1d751a5f8271d482d14ca55d9e2deeebbae577f', sizeMb: 484 },
  turbo: { repo: 'deepdml/faster-whisper-large-v3-turbo-ct2', rev: '4df90f75321148c3a29a9e2351b7ddf8f5b115a8', sizeMb: 1617 },
  distil: { repo: 'Systran/faster-distil-whisper-large-v3', rev: 'c3058b475261292e64a0412df1d2681c06260fab', sizeMb: 1512 },
} as const
/** NVIDIA Parakeet TDT 0.6B v3 (CC-BY-4.0 weights) as int8 ONNX by istupakov, pinned by commit; runs on CPU through onnxruntime (small packages, no CUDA). onnx-asr 0.12 needs a separate onnxruntime. */
export const PARAKEET_PACKAGES = ['onnx-asr[hub]==0.12.0', 'onnxruntime==1.23.2'] as const
/** onnxruntime 1.23.2 has no Windows-on-ARM wheel; 1.24.2 is the first that does and decodes the same model (checked on macOS). */
export const parakeetPackages = (platform = process.platform, arch = process.arch): readonly string[] =>
  platform === 'win32' && arch === 'arm64' ? [PARAKEET_PACKAGES[0], 'onnxruntime==1.24.2'] : PARAKEET_PACKAGES
export const PARAKEET_MODELS = {
  v3: { repo: 'istupakov/parakeet-tdt-0.6b-v3-onnx', rev: '8f23f0c03c8761650bdb5b40aaf3e40d2c15f1ce', sizeMb: 640 },
} as const
/** "Any Hugging Face model" engine (hf.ts): transformers' ASR pipeline on PyTorch. Versions are the ones the plan names and were not installed in CI: confirm them on the first real install. torch comes from PyPI (MPS on Apple silicon), the CPU index on Linux, the CUDA index when a usable NVIDIA GPU is there (Windows PyPI wheels are CPU-only). */
export const HF_PACKAGES = ['huggingface_hub==2.2.0', 'soundfile==0.14.0', 'numpy==2.5.3'] as const
export const HF_TORCH = 'torch==2.14.1'
export const HF_TORCH_INDEX = { cuda: 'https://download.pytorch.org/whl/cu128', cpu: 'https://download.pytorch.org/whl/cpu' } as const
/** Curated one-click entry on the hf engine: NVIDIA Nemotron 3.5 ASR (OpenMDW-1.1, 40 locales, transformers AutoModelForRNNT). The lead fills the commit after the first real install; a wrong sha only makes the download fail. */
export const NEMOTRON_REPO = 'nvidia/nemotron-3.5-asr-streaming-0.6b'
export const NEMOTRON_REV = 'ea30d66debe3740a08b573244286791d423d6b3e'
export const NEMOTRON_MODEL = `${NEMOTRON_REPO}@${NEMOTRON_REV}`
export const DEFAULT_HF_OPTIONS = { language: 'en-US', lookahead: 3 } as const
export const MOONSHINE_PIN = PINS.moonshine
export const MOONSHINE_MODELS = ['tiny', 'small', 'medium'] as const
/** MLX conversions of OpenAI Whisper (MIT), pinned by commit so a session never loads moved weights (S2 install recipe). */
export const WHISPER_MODELS = {
  small: { repo: 'mlx-community/whisper-small-mlx', rev: '45f3915923c7a79a5a5b5a7d909d39aeb0e5630e', sizeMb: 481 },
  turbo: { repo: 'mlx-community/whisper-large-v3-turbo', rev: 'a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb', sizeMb: 1600 },
} as const
export const STT_MODELS: Record<SttEngineId, readonly string[]> = { moonshine: MOONSHINE_MODELS, 'whisper-mlx': Object.keys(WHISPER_MODELS), 'faster-whisper': Object.keys(FASTER_WHISPER_MODELS), parakeet: Object.keys(PARAKEET_MODELS), hf: [NEMOTRON_MODEL] }
/** Download sizes (MB) from the S2 report; the Whisper venv adds about 1.3 GB because mlx-whisper depends on torch. */
export const MODEL_SIZE_MB: Record<string, number> = { 'moonshine:tiny': 45, 'moonshine:small': 139, 'moonshine:medium': 269, 'whisper-mlx:small': 481, 'whisper-mlx:turbo': 1600, 'faster-whisper:small': 484, 'faster-whisper:turbo': 1617, 'faster-whisper:distil': 1512, 'parakeet:v3': 640 }
export const DEFAULT_MOONSHINE_MODEL = 'small'

/** S2 (plan §3.2): Whisper small on MLX on Apple silicon; NVIDIA Parakeet v3 on Windows and Linux (whole sentences in one piece, real-time on a CPU, no GPU needed); Moonshine on Intel Macs. */
export const defaultEngine = (platform = process.platform, arch = process.arch): SttEngineId =>
  platform === 'darwin' ? (arch === 'arm64' ? 'whisper-mlx' : 'moonshine') : 'parakeet'
/** faster-whisper: large-v3-turbo when a usable GPU is there, else the English small model (int8 on CPU). Parakeet has one model. */
export const defaultModel = (engine: SttEngineId, cuda = usableGpu() !== null): string => (engine === 'parakeet' ? 'v3' : engine === 'hf' ? NEMOTRON_MODEL : engine === 'faster-whisper' && cuda ? 'turbo' : 'small')

export const venvPython = (dir: string, platform = process.platform) =>
  path.join(dir, 'venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
export const sttDir = () => process.env.CAREERLOOM_STT_DIR || path.join(os.userInfo().homedir, '.careerloom', 'stt')
export const engineDir = (engine: SttEngineId, root = sttDir()) => path.join(root, engine)
export const readyFile = (dir: string) => path.join(dir, 'ready.json')

/** Shown (toast / overlay error) when a session starts without the chosen local model. */
export const STT_NOT_INSTALLED = 'Speech recognition is not installed yet. Install the speech model in Settings → Local models, then start again.'

export type SttRuntime = { python: string; script: string; cache: string; pin: string; models: string[]; /** faster-whisper only: the NVIDIA CUDA wheels were installed (false = CPU-only install). */ cuda?: boolean }

/** A finished install of the pinned package, or null (also null for engines with no local install). */
export function findSttRuntime(engine: SttEngineId = 'moonshine', root = sttDir()): SttRuntime | null {
  const dir = engineDir(engine, root)
  let ready: { pin?: string; models?: string[]; cuda?: boolean }
  try { ready = JSON.parse(fs.readFileSync(readyFile(dir), 'utf8')) } catch { return null }
  const python = venvPython(dir)
  if (ready.pin !== PINS[engine] || !fs.existsSync(python)) return null
  return { python, script: path.join(dir, 'bin', 'careerloom_stt.py'), cache: path.join(dir, 'models'), pin: ready.pin, models: ready.models ?? [], cuda: ready.cuda }
}
