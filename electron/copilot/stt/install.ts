// Optional local STT install, like prescreen-model.ts: venv + pinned package + model + self-test under
// ~/.careerloom/stt/<engine>/. Nothing ML ships in the installers. ready.json marks a finished install.
import fs from 'node:fs'
import path from 'node:path'

import { launchTask, runs, summary } from '../../context'
import { assertMemory, findPython, MIN_PYTHON } from '../../prescreen-model'
import { spawnSpec, startRun, type SpawnSpec } from '../../runner'
import { DEFAULT_MOONSHINE_MODEL, engineDir, findSttRuntime, MOONSHINE_MODELS, MOONSHINE_PIN, readyFile, venvPython } from './runtime'
import { sidecarScript } from './sidecar-script'

/** Steps after `python -m venv`: [label, argv for the venv's python]. */
export function installCommands(script: string, cache: string, model: string): Array<[string, string[]]> {
  return [
    ['Packages', ['-m', 'pip', 'install', '--disable-pip-version-check', MOONSHINE_PIN]],
    ['Model', [script, 'fetch', model, cache]],
    ['Self-test', [script, 'selftest', model, cache]],
  ]
}

let installRun: string | null = null

export async function installStt(model: string = DEFAULT_MOONSHINE_MODEL) {
  if (!(MOONSHINE_MODELS as readonly string[]).includes(model)) throw new Error(`Unknown Moonshine model: ${model}`)
  if (installRun && runs.get(installRun)?.status === 'running') return summary(runs.get(installRun)!)
  const { ok } = await findPython()
  if (!ok) throw new Error(`Python ${MIN_PYTHON.join('.')} or newer is needed — install it, then check again`)
  await assertMemory()
  const dir = engineDir('moonshine')
  const script = sidecarScript(path.join(dir, 'bin'))
  const cache = path.join(dir, 'models')
  fs.mkdirSync(dir, { recursive: true })
  const prev = findSttRuntime()
  fs.rmSync(readyFile(dir), { force: true })
  const env = { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1', HF_HUB_DISABLE_TELEMETRY: '1', PYTHONUNBUFFERED: '1' }
  const steps: Array<[string, SpawnSpec]> = [
    ['Python', spawnSpec(ok.bin, [...ok.pre, '-m', 'venv', path.join(dir, 'venv')])],
    ...installCommands(script, cache, model).map(([label, args]): [string, SpawnSpec] => [label, { bin: venvPython(dir), args, env }]),
  ]
  const run = launchTask({ runner: 'setup', mode: 'setup', label: 'Install local speech model', input: `moonshine ${model}` }, async (log, run) => {
    for (const [i, [label, spec]] of steps.entries()) {
      if (run.status !== 'running') return
      log(`\n▸ ${label} (${i + 1}/${steps.length}): ${path.basename(spec.bin)} ${spec.args.slice(0, 6).join(' ')}\n`)
      const code = await new Promise<number | null>(resolve => startRun(run.id, spec, dir, { onChunk: (_, t) => log(t), onExit: resolve }))
      if (run.status !== 'running') return
      if (code !== 0) throw new Error(`${label} step failed (exit ${code ?? 'signal'}) — check your connection and try again`)
    }
    const models = [...new Set([...(prev?.models ?? []), model])]
    fs.writeFileSync(readyFile(dir), JSON.stringify({ pin: MOONSHINE_PIN, models, installedAt: new Date().toISOString() }))
    log('\n✓ Local speech model installed\n')
  })
  installRun = run.id
  return summary(run)
}
