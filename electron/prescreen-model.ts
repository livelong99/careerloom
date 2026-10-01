// The pre-screen's local model: Manav2op/verdict-small on PyTorch (CPU), installed on demand into
// ~/.careerloom/model/{venv,weights} — nothing ships in the installers. Install = a tracked run:
// venv → packages → weights → self-test; ready.json marks a finished install of this exact revision.
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { launchTask, runs, summary, type Handler } from './context'
import type { LocalModelStatus } from './contract'
import { sidecarScript } from './fit-sidecar'
import { resolveBin, spawnSpec, startRun, type SpawnSpec } from './runner'
import { hasManagedTool } from './runtime/paths'

export const MODEL = 'Manav2op/verdict-small'
export const REV = '085a41e0ea269f00483dd202a286cfb68f7aa63a'
export const MODEL_KEY = `${MODEL}@${REV}`
/** Approximate download sizes, shown before installing. */
export const DOWNLOAD_GB = { packages: 0.9, weights: 0.47 }
export const MIN_PYTHON: [number, number] = [3, 10]
/** Measured ~1.0 GB RSS at inference; refuse to load below this. */
export const MIN_FREE_BYTES = 1.5e9

export const modelDir = () => path.join(os.userInfo().homedir, '.careerloom', 'model')
export const venvPython = (dir: string, platform = process.platform) =>
  path.join(dir, 'venv', platform === 'win32' ? 'Scripts/python.exe' : 'bin/python')
const readyFile = (dir: string) => path.join(dir, 'ready.json')

export type Runtime = { python: string; weights: string; model: string }

/** A finished install of this model revision, or null. */
export function findRuntime(dir = modelDir()): Runtime | null {
  const python = venvPython(dir)
  const weights = path.join(dir, 'weights')
  try {
    if (JSON.parse(fs.readFileSync(readyFile(dir), 'utf8')).model !== MODEL_KEY) return null
  } catch { return null }
  return fs.existsSync(python) && fs.existsSync(path.join(weights, 'model.safetensors')) ? { python, weights, model: MODEL_KEY } : null
}

// ————— Python ≥ 3.10 —————

/** Interpreters to try, best first: [bin, leading args]. */
export const pythonCandidates = (platform = process.platform): Array<[string, string[]]> => {
  const managed: Array<[string, string[]]> = hasManagedTool('python', platform) ? [[platform === 'win32' ? 'python' : 'python3', []]] : [] // resolves to Careerloom's own copy first
  return [...managed, ...(platform === 'win32' ? [['py', ['-3']], ['python', []]] as Array<[string, string[]]> : ['python3.13', 'python3.12', 'python3.11', 'python3.10', 'python3', 'python'].map((b): [string, string[]] => [b, []]))]
}

export function pythonVersionOk(version: string | null): boolean {
  const [maj, min] = (version ?? '').split('.').map(Number)
  return maj! > MIN_PYTHON[0] || (maj === MIN_PYTHON[0] && min! >= MIN_PYTHON[1])
}

type PyFound = { bin: string; pre: string[]; version: string }
const VERSION_CODE = 'import sys; print("%d.%d.%d" % sys.version_info[:3])'

function probePython(bin: string, pre: string[]): Promise<PyFound | null> {
  if (!resolveBin(bin)) return Promise.resolve(null)
  const spec = spawnSpec(bin, [...pre, '-c', VERSION_CODE])
  return new Promise(resolve => execFile(spec.bin, spec.args, { env: spec.env, timeout: 10_000, windowsHide: true, shell: false }, (err, out) => {
    const version = err ? null : /(\d+\.\d+\.\d+)/.exec(out)?.[1] ?? null
    resolve(version ? { bin, pre, version } : null)
  }))
}

/** The first suitable interpreter, else the newest too-old one found (for the message). */
export async function findPython(): Promise<{ ok: PyFound | null; old: PyFound | null }> {
  let old: PyFound | null = null
  for (const [bin, pre] of pythonCandidates()) {
    const p = await probePython(bin, pre)
    if (p && pythonVersionOk(p.version)) return { ok: p, old }
    old ??= p
  }
  return { ok: null, old }
}

// ————— Install —————

const PACKAGES = ['transformers>=5.17,<6', 'scikit-learn>=1.5', 'safetensors', 'huggingface_hub']
const TORCH = 'torch==2.14.0'
const CPU_INDEX = 'https://download.pytorch.org/whl/cpu'
const DOWNLOAD_CODE = 'import sys; from huggingface_hub import snapshot_download as d; '
  + 'd(sys.argv[1], revision=sys.argv[2], local_dir=sys.argv[3], allow_patterns=["*.json", "model.safetensors", "tokenizer*", "sentencepiece*"])'

/** Install steps as [label, argv for the venv's python], after `python -m venv`. Macs get torch's default
 *  wheel; elsewhere the CPU-only index, so no CUDA wheels are pulled. Labels match the UI's step list. */
export function installCommands(platform: string, weights: string, script: string): Array<[string, string[]]> {
  const pip = ['-m', 'pip', 'install', '--disable-pip-version-check']
  return [
    ...(platform === 'darwin'
      ? [['Packages', [...pip, TORCH, ...PACKAGES]] as [string, string[]]]
      : [['Packages', [...pip, TORCH, '--index-url', CPU_INDEX]], ['Packages', [...pip, ...PACKAGES]]] as Array<[string, string[]]>),
    ['Model', ['-c', DOWNLOAD_CODE, MODEL, REV, weights]],
    ['Self-test', [script, 'selftest', weights]],
  ]
}

// ————— Memory —————

/** macOS os.freemem() leaves out reclaimable pages; count free + inactive + speculative + purgeable. */
export function parseVmStat(out: string): number | null {
  const page = Number(/page size of (\d+)/.exec(out)?.[1])
  const pages = ['free', 'inactive', 'speculative', 'purgeable'].map(k => Number(new RegExp(`Pages ${k}:\\s+(\\d+)`).exec(out)?.[1] ?? 0))
  return page ? pages.reduce((a, b) => a + b, 0) * page : null
}

function availableMemory(): Promise<number> {
  if (process.platform !== 'darwin') return Promise.resolve(os.freemem())
  return new Promise(resolve => execFile('/usr/bin/vm_stat', [], { timeout: 5000, shell: false }, (err, out) => resolve((!err && parseVmStat(out)) || os.freemem())))
}

export async function assertMemory(): Promise<void> {
  const free = await availableMemory()
  if (free < MIN_FREE_BYTES) {
    throw new Error(`Not enough free memory for the local model (${(free / 1e9).toFixed(1)} GB free, needs 1.5 GB) — close some apps and try again`)
  }
}

// ————— Handlers —————

let installRun: string | null = null

export async function localModelStatus(): Promise<LocalModelStatus> {
  const { ok, old } = await findPython()
  const running = installRun && runs.get(installRun)?.status === 'running' ? installRun : null
  return {
    installed: !!findRuntime(),
    model: MODEL,
    dir: modelDir(),
    platform: process.platform,
    arch: process.arch,
    python: ok && { bin: ok.bin, version: ok.version },
    oldPython: old?.version ?? null,
    downloadGb: DOWNLOAD_GB,
    installRun: running,
  }
}

export async function installLocalModel() {
  if (installRun && runs.get(installRun)?.status === 'running') return summary(runs.get(installRun)!)
  const { ok } = await findPython()
  if (!ok) throw new Error(`Python ${MIN_PYTHON.join('.')} or newer is needed — install it, then check again`)
  await assertMemory()
  const dir = modelDir()
  const weights = path.join(dir, 'weights')
  fs.mkdirSync(dir, { recursive: true })
  fs.rmSync(readyFile(dir), { force: true })
  const env = { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1', HF_HUB_DISABLE_TELEMETRY: '1', PYTHONUNBUFFERED: '1' }
  const steps: Array<[string, SpawnSpec]> = [
    ['Python', spawnSpec(ok.bin, [...ok.pre, '-m', 'venv', path.join(dir, 'venv')])],
    ...installCommands(process.platform, weights, sidecarScript(path.join(dir, 'bin'))).map(([label, args]): [string, SpawnSpec] => [label, { bin: venvPython(dir), args, env }]),
  ]
  const run = launchTask({ runner: 'setup', mode: 'setup', label: 'Install local model', input: MODEL }, async (log, run) => {
    for (const [i, [label, spec]] of steps.entries()) {
      if (run.status !== 'running') return
      log(`\n▸ ${label} (${i + 1}/${steps.length}): ${path.basename(spec.bin)} ${spec.args.slice(0, 6).join(' ')}\n`)
      const code = await new Promise<number | null>(resolve => startRun(run.id, spec, dir, { onChunk: (_, t) => log(t), onExit: resolve }))
      if (run.status !== 'running') return
      if (code !== 0) throw new Error(`${label} step failed (exit ${code ?? 'signal'}) — check your connection and try again`)
    }
    fs.writeFileSync(readyFile(dir), JSON.stringify({ model: MODEL_KEY, installedAt: new Date().toISOString() }))
    log('\n✓ Local model installed\n')
  })
  installRun = run.id
  return summary(run)
}

export const localModelHandlers: Record<string, Handler> = { localModelStatus, installLocalModel }
