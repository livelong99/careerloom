// Optional local STT install, like prescreen-model.ts: venv + pinned package + model + self-test under
// ~/.careerloom/stt/<engine>/. Nothing ML ships in the installers. ready.json marks a finished install.
import fs from 'node:fs'
import path from 'node:path'

import { launchTask, runs, summary } from '../../context'
import { assertMemory, findPython, MIN_PYTHON } from '../../prescreen-model'
import { spawnSpec, startRun, type SpawnSpec } from '../../runner'
import type { SttEngineId } from '../types'
import { SCRIPT as FASTER_WHISPER_SCRIPT } from './faster-whisper-script'
import { SCRIPT as PARAKEET_SCRIPT } from './parakeet-script'
import { usableGpu } from './gpu'
import { engineDir, FASTER_WHISPER_CUDA_PACKAGES, FASTER_WHISPER_MODELS, FASTER_WHISPER_PACKAGES, findSttRuntime, PARAKEET_MODELS, PARAKEET_PACKAGES, PINS, readyFile, STT_MODELS, venvPython, WHISPER_MODELS } from './runtime'
import { sidecarScript, writeScript } from './sidecar-script'
import { SCRIPT as WHISPER_SCRIPT } from './whisper-script'

const PIP = ['-m', 'pip', 'install', '--disable-pip-version-check']

/** Steps after `python -m venv`: [label, argv for the venv's python]. */
export function installCommands(engine: SttEngineId, script: string, cache: string, model: string, cuda = false): Array<[string, string[]]> {
  if (engine === 'faster-whisper') {
    const m = FASTER_WHISPER_MODELS[model as keyof typeof FASTER_WHISPER_MODELS]
    const device = cuda ? 'cuda' : 'cpu'
    return [
      [cuda ? 'Packages (about 1.3 GB: NVIDIA CUDA libraries, no CUDA toolkit needed)' : 'Packages', [...PIP, PINS['faster-whisper'], ...FASTER_WHISPER_PACKAGES, ...(cuda ? FASTER_WHISPER_CUDA_PACKAGES : [])]],
      ['Model', [script, 'fetch', m.repo, m.rev, cache]],
      [`Self-test (${cuda ? 'GPU, falls back to CPU if CUDA fails' : 'CPU'})`, [script, 'selftest', m.repo, m.rev, cache, device, cuda ? 'float16' : 'int8']],
    ]
  }
  if (engine === 'parakeet') {
    const m = PARAKEET_MODELS[model as keyof typeof PARAKEET_MODELS]
    return [
      ['Packages', [...PIP, ...PARAKEET_PACKAGES]],
      [`Model (about ${m.sizeMb} MB)`, [script, 'fetch', m.repo, m.rev, cache]],
      ['Self-test', [script, 'selftest', m.repo, m.rev, cache]],
    ]
  }
  if (engine === 'whisper-mlx') {
    const m = WHISPER_MODELS[model as keyof typeof WHISPER_MODELS]
    return [
      ['Packages (about 1.3 GB: Whisper needs PyTorch)', [...PIP, PINS['whisper-mlx']]],
      ['Model', [script, 'fetch', m.repo, m.rev, cache]],
      ['Self-test', [script, 'selftest', m.repo, m.rev, cache]],
    ]
  }
  return [
    ['Packages', [...PIP, PINS.moonshine]],
    ['Model', [script, 'fetch', model, cache]],
    ['Self-test', [script, 'selftest', model, cache]],
  ]
}

let installRun: string | null = null

export async function installStt(engine: SttEngineId, model: string) {
  if (!STT_MODELS[engine].includes(model)) throw new Error(`Unknown ${engine} model: ${model}`)
  if (installRun && runs.get(installRun)?.status === 'running') return summary(runs.get(installRun)!)
  const { ok } = await findPython()
  if (!ok) throw new Error(`Python ${MIN_PYTHON.join('.')} or newer is needed — install it, then check again`)
  await assertMemory()
  const dir = engineDir(engine)
  const script = engine === 'whisper-mlx' ? writeScript(path.join(dir, 'bin'), WHISPER_SCRIPT) : engine === 'parakeet' ? writeScript(path.join(dir, 'bin'), PARAKEET_SCRIPT) : engine === 'faster-whisper' ? writeScript(path.join(dir, 'bin'), FASTER_WHISPER_SCRIPT) : sidecarScript(path.join(dir, 'bin'))
  const cuda = engine === 'faster-whisper' && usableGpu() !== null
  const cache = path.join(dir, 'models')
  fs.mkdirSync(dir, { recursive: true })
  const prev = findSttRuntime(engine)
  fs.rmSync(readyFile(dir), { force: true })
  const env = { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1', HF_HUB_DISABLE_TELEMETRY: '1', PYTHONUNBUFFERED: '1' }
  const steps: Array<[string, SpawnSpec]> = [
    ['Python', spawnSpec(ok.bin, [...ok.pre, '-m', 'venv', path.join(dir, 'venv')])],
    ...installCommands(engine, script, cache, model, cuda).map(([label, args]): [string, SpawnSpec] => [label, { bin: venvPython(dir), args, env }]),
  ]
  const run = launchTask({ runner: 'setup', mode: 'setup', label: 'Install local speech model', input: `${engine} ${model}` }, async (log, run) => {
    for (const [i, [label, spec]] of steps.entries()) {
      if (run.status !== 'running') return
      log(`\n▸ ${label} (${i + 1}/${steps.length}): ${path.basename(spec.bin)} ${spec.args.slice(0, 6).join(' ')}\n`)
      const code = await new Promise<number | null>(resolve => startRun(run.id, spec, dir, { onChunk: (_, t) => log(t), onExit: resolve }))
      if (run.status !== 'running') return
      if (code !== 0) throw new Error(`${label} step failed (exit ${code ?? 'signal'}) — check your connection and try again`)
    }
    const models = [...new Set([...(prev?.models ?? []), model])]
    fs.writeFileSync(readyFile(dir), JSON.stringify({ pin: PINS[engine], models, ...(engine === 'faster-whisper' ? { cuda } : {}), installedAt: new Date().toISOString() }))
    log('\n✓ Local speech model installed\n')
  })
  installRun = run.id
  return summary(run)
}
