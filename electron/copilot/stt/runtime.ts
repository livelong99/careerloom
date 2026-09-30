// Where the optional local STT install lives and whether a finished one is present (no electron imports).
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import type { SttEngineId } from '../types'

/** Pinned: PyPI moonshine-voice 0.1.5 (MIT wheel). Bump deliberately. */
export const MOONSHINE_PIN = 'moonshine-voice==0.1.5'
export const MOONSHINE_MODELS = ['tiny', 'small', 'medium'] as const
/** ponytail: switchable default until the S2 bake-off report names the winner (plan §3.2). */
export const DEFAULT_MOONSHINE_MODEL = 'small'

export const venvPython = (dir: string, platform = process.platform) =>
  path.join(dir, 'venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
export const sttDir = () => process.env.CAREERLOOM_STT_DIR || path.join(os.userInfo().homedir, '.careerloom', 'stt')
export const engineDir = (engine: SttEngineId, root = sttDir()) => path.join(root, engine)
export const readyFile = (dir: string) => path.join(dir, 'ready.json')

export type SttRuntime = { python: string; script: string; cache: string; pin: string; models: string[] }

/** A finished install of the pinned package, or null. */
export function findSttRuntime(engine: SttEngineId = 'moonshine', root = sttDir()): SttRuntime | null {
  const dir = engineDir(engine, root)
  let ready: { pin?: string; models?: string[] }
  try { ready = JSON.parse(fs.readFileSync(readyFile(dir), 'utf8')) } catch { return null }
  const python = venvPython(dir)
  if (ready.pin !== MOONSHINE_PIN || !fs.existsSync(python)) return null
  return { python, script: path.join(dir, 'bin', 'careerloom_stt.py'), cache: path.join(dir, 'models'), pin: ready.pin, models: ready.models ?? [] }
}

