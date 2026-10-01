// Where the optional local STT install lives and whether a finished one is present (no electron imports).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { SttEngineId } from '../types'

/** Pinned PyPI packages. Bump deliberately: the S2 numbers and licence check are for these versions. */
export const PINS = { moonshine: 'moonshine-voice==0.1.5', 'whisper-mlx': 'mlx-whisper==0.4.3' } as const
export const MOONSHINE_PIN = PINS.moonshine
export const MOONSHINE_MODELS = ['tiny', 'small', 'medium'] as const
/** MLX conversions of OpenAI Whisper (MIT), pinned by commit so a session never loads moved weights (S2 install recipe). */
export const WHISPER_MODELS = {
  small: { repo: 'mlx-community/whisper-small-mlx', rev: '45f3915923c7a79a5a5b5a7d909d39aeb0e5630e', sizeMb: 481 },
  turbo: { repo: 'mlx-community/whisper-large-v3-turbo', rev: 'a4aaeec0636e6fef84abdcbe3544cb2bf7e9f6fb', sizeMb: 1600 },
} as const
export const STT_MODELS: Record<'moonshine' | 'whisper-mlx', readonly string[]> = { moonshine: MOONSHINE_MODELS, 'whisper-mlx': Object.keys(WHISPER_MODELS) }
/** Download sizes (MB) from the S2 report; the Whisper venv adds about 1.3 GB because mlx-whisper depends on torch. */
export const MODEL_SIZE_MB: Record<string, number> = { 'moonshine:tiny': 45, 'moonshine:small': 139, 'moonshine:medium': 269, 'whisper-mlx:small': 481, 'whisper-mlx:turbo': 1600 }
export const DEFAULT_MOONSHINE_MODEL = 'small'

/** S2 (plan §3.2): Whisper small on MLX wins on Apple silicon; Moonshine small streaming is the fallback everywhere else. */
export const defaultEngine = (platform = process.platform, arch = process.arch): SttEngineId => (platform === 'darwin' && arch === 'arm64' ? 'whisper-mlx' : 'moonshine')
export const defaultModel = (_engine: SttEngineId): string => 'small'

export const venvPython = (dir: string, platform = process.platform) =>
  path.join(dir, 'venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
export const sttDir = () => process.env.CAREERLOOM_STT_DIR || path.join(os.userInfo().homedir, '.careerloom', 'stt')
export const engineDir = (engine: SttEngineId, root = sttDir()) => path.join(root, engine)
export const readyFile = (dir: string) => path.join(dir, 'ready.json')

/** Shown (toast / overlay error) when a session starts without the chosen local model. */
export const STT_NOT_INSTALLED = 'Speech recognition is not installed yet. Install the speech model in Settings → Local models, then start again.'

export type SttRuntime = { python: string; script: string; cache: string; pin: string; models: string[] }

/** A finished install of the pinned package, or null (also null for engines with no local install). */
export function findSttRuntime(engine: SttEngineId = 'moonshine', root = sttDir()): SttRuntime | null {
  if (engine === 'faster-whisper') return null
  const dir = engineDir(engine, root)
  let ready: { pin?: string; models?: string[] }
  try { ready = JSON.parse(fs.readFileSync(readyFile(dir), 'utf8')) } catch { return null }
  const python = venvPython(dir)
  if (ready.pin !== PINS[engine] || !fs.existsSync(python)) return null
  return { python, script: path.join(dir, 'bin', 'careerloom_stt.py'), cache: path.join(dir, 'models'), pin: ready.pin, models: ready.models ?? [] }
}
