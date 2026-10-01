// On-demand Kokoro install into ~/.careerloom/tts (prescreen-model.ts pattern): venv → hashed pip pins → verified model files → sidecar script → self-test.
// Nothing ML ships in the installers. Pins are macOS arm64 / CPython 3.10+ wheels (approved at the KB-WP5 gate); other platforms are unsupported until their hashes are added.
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { launchTask, runs, summary } from '../context'
import { assertMemory, findPython, MIN_PYTHON, venvPython } from '../prescreen-model'
import { startRun, spawnSpec, type SpawnSpec } from '../runner'
import { KOKORO_SCRIPT } from './kokoro-script'

export type Pin = { name: string; version: string; sha256: string }
export const PINS: Pin[] = [
  { name: 'kokoro-onnx', version: '0.6.1', sha256: '50c8de4950d601df41428ee5462a48c8a78bef441bf671f2492e070ef44d8a32' },
  { name: 'onnxruntime', version: '1.23.2', sha256: 'a7730122afe186a784660f6ec5807138bf9d792fa1df76556b27307ea9ebcbe3' },
  { name: 'espeakng-loader', version: '0.2.4', sha256: 'd27cdca31112226e7299d8562e889d3e38a1e48055c9ee381b45d669072ee59f' },
  { name: 'numpy', version: '2.2.6', sha256: '37e990a01ae6ec7fe7fa1c26c55ecb672dd98b19c3d0e1d1f326fa13cb38d163' },
  { name: 'phonemizer', version: '3.4.0', sha256: '5ff1215d0efa3606dd1b92449f6d71b5c1741efcc84c6d40c17bfaf64f6ded5f' },
  { name: 'coloredlogs', version: '15.0.1', sha256: '612ee75c546f53e92e70049c9dbfcc18c935a2b9a53b66085ce9ef6a6e5c0934' },
  { name: 'flatbuffers', version: '25.12.19', sha256: '7634f50c427838bb021c2d66a3d1168e9d199b0607e6329399f04846d42e20b4' },
  { name: 'packaging', version: '26.3', sha256: 'd7193f7c8e4e93f444fde0262bf90af30e16fa0ad0ad44cb553c87339b23cd1c' },
  { name: 'protobuf', version: '7.36.2', sha256: 'cbc70b17ee27e28894c7fee8bb04be1abead49e936bc70eb60052531eee2079e' },
  { name: 'sympy', version: '1.14.0', sha256: 'e091cc3e99d2141a0ba2847328f5479b05d94a6635cb96148ccb3f34671bd8f5' },
  { name: 'attrs', version: '26.1.0', sha256: 'c647aa4a12dfbad9333ca4e71fe62ddc36f4e63b2d260a37a8b83d2f043ac309' },
  { name: 'humanfriendly', version: '10.0', sha256: '1697e1a8a8f550fd43c2865cd84542fc175a61dcb779b6fee18cf6b6ccba1477' },
  { name: 'mpmath', version: '1.3.0', sha256: 'a0b2b9fe80bbcd81a6647ff13108738cfb482d481d826cc0e02f5b35e5c88d2c' },
  { name: 'dlinfo', version: '2.0.0', sha256: 'b32cc18e3ea67c0ca9ca409e5b41eed863bd1363dbc9dd3de90fedf11b61e7bc' },
  { name: 'joblib', version: '1.6.0', sha256: '3dbbf9f6e4b592a2357b854608e980fe6390d131d7a82f011a377ef2ebef7aba' },
  { name: 'typing_extensions', version: '4.16.0', sha256: '481caa481374e813c1b176ada14e97f1f67a4539ce9cfeb3f350d78d6370c2e8' },
  { name: 'cloudpickle', version: '3.1.2', sha256: '9acb47f6afd73f60dc1df93bb801b472f05ff42fa6c84167d25cb206be1fbf4a' },
]
const RELEASE = 'https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0'
export const MODEL_FILES = [
  { file: 'kokoro-v1.0.int8.onnx', url: `${RELEASE}/kokoro-v1.0.int8.onnx`, sha256: '6e742170d309016e5891a994e1ce1559c702a2ccd0075e67ef7157974f6406cb', mb: 88 },
  { file: 'voices-v1.0.bin', url: `${RELEASE}/voices-v1.0.bin`, sha256: 'bca610b8308e8d99f32e6fe4197e7ec01679264efed0cac9140fe9c29f1fbf7d', mb: 27 },
]
const KOKORO_VERSION = PINS.find(p => p.name === 'kokoro-onnx')!.version
/** Identifies one exact pin + model set; a mismatch means "not installed". */
export const KOKORO_KEY = `${KOKORO_VERSION}+${MODEL_FILES[0].sha256.slice(0, 8)}`
/** Approximate download sizes (shown before installing). */
export const KOKORO_DOWNLOAD_MB = { packages: 60, models: MODEL_FILES.reduce((a, f) => a + f.mb, 0) }

export const ttsDir = () => path.join(os.userInfo().homedir, '.careerloom', 'tts')
export const installSupported = (platform = process.platform, arch = process.arch) => platform === 'darwin' && arch === 'arm64'
export const requirementsText = () => PINS.map(p => `${p.name}==${p.version} --hash=sha256:${p.sha256}`).join('\n') + '\n'

export type KokoroRuntime = { python: string; script: string; model: string; voices: string }
const readyFile = (dir: string) => path.join(dir, 'ready.json')

/** A finished install of exactly this pin set, or null. */
export function findKokoro(dir = ttsDir()): KokoroRuntime | null {
  try { if (JSON.parse(fs.readFileSync(readyFile(dir), 'utf8')).kokoro !== KOKORO_KEY) return null } catch { return null }
  const rt = { python: venvPython(dir), script: path.join(dir, 'bin', 'kokoro_sidecar.py'), model: path.join(dir, 'models', MODEL_FILES[0].file), voices: path.join(dir, 'models', MODEL_FILES[1].file) }
  return Object.values(rt).every(p => fs.existsSync(p)) ? rt : null
}

/** Steps run with the venv's python, after `python -m venv`. */
export const installSteps = (dir: string): Array<{ label: string; args: string[] }> => [
  { label: 'Packages', args: ['-m', 'pip', 'install', '--disable-pip-version-check', '--require-hashes', '--no-deps', '-r', path.join(dir, 'requirements.txt')] },
  { label: 'Self-test', args: [path.join(dir, 'bin', 'kokoro_sidecar.py'), path.join(dir, 'models', MODEL_FILES[0].file), path.join(dir, 'models', MODEL_FILES[1].file), '--selftest'] },
]

/** https only; the file appears at `dest` only after its sha256 matches. */
export async function downloadVerified(url: string, dest: string, sha256: string, doFetch: typeof fetch = fetch): Promise<void> {
  if (!url.startsWith('https://')) throw new Error('Model downloads must use https')
  const res = await doFetch(url, { redirect: 'follow' })
  if (!res.ok) throw new Error(`Download failed (${res.status}) for ${path.basename(dest)}`)
  const buf = Buffer.from(await res.arrayBuffer())
  if (createHash('sha256').update(buf).digest('hex') !== sha256) throw new Error(`Checksum mismatch for ${path.basename(dest)}: refusing to install`)
  const part = `${dest}.part`
  fs.writeFileSync(part, buf)
  fs.renameSync(part, dest)
}

let installRun: string | null = null
export const kokoroInstallRunning = () => !!installRun && runs.get(installRun)?.status === 'running'

export async function installKokoro(): Promise<{ runId: string }> {
  if (installRun && runs.get(installRun)?.status === 'running') return { runId: installRun }
  if (!installSupported()) throw new Error('Local Kokoro voices are only available on Apple Silicon Macs for now')
  const { ok } = await findPython()
  if (!ok) throw new Error(`Python ${MIN_PYTHON.join('.')} or newer is needed: install it, then try again`)
  await assertMemory()
  const dir = ttsDir()
  fs.mkdirSync(path.join(dir, 'bin'), { recursive: true }); fs.mkdirSync(path.join(dir, 'models'), { recursive: true })
  fs.rmSync(readyFile(dir), { force: true })
  fs.writeFileSync(path.join(dir, 'requirements.txt'), requirementsText())
  fs.writeFileSync(path.join(dir, 'bin', 'kokoro_sidecar.py'), KOKORO_SCRIPT)
  const env = { ...process.env, PIP_DISABLE_PIP_VERSION_CHECK: '1', PYTHONUNBUFFERED: '1' }
  const exec = (label: string, spec: SpawnSpec, runId: string, log: (t: string) => void) => new Promise<void>((resolve, reject) => {
    log(`\n▸ ${label}\n`)
    startRun(runId, spec, dir, { onChunk: (_, t) => log(t), onExit: code => (code === 0 ? resolve() : reject(new Error(`${label} step failed (exit ${code ?? 'signal'}): check your connection and try again`))) })
  })
  const run = launchTask({ runner: 'setup', mode: 'setup', label: 'Install Kokoro voice', input: 'kokoro-onnx' }, async (log, r) => {
    await exec('Python (venv)', spawnSpec(ok.bin, [...ok.pre, '-m', 'venv', path.join(dir, 'venv')]), r.id, log)
    const [pip, selftest] = installSteps(dir)
    await exec(pip.label, { bin: venvPython(dir), args: pip.args, env }, r.id, log)
    for (const f of MODEL_FILES) {
      if (r.status !== 'running') return
      log(`\n▸ Model: ${f.file} (~${f.mb} MB)\n`)
      await downloadVerified(f.url, path.join(dir, 'models', f.file), f.sha256)
    }
    if (r.status !== 'running') return
    await exec(selftest.label, { bin: venvPython(dir), args: selftest.args, env }, r.id, log)
    fs.writeFileSync(readyFile(dir), JSON.stringify({ kokoro: KOKORO_KEY, installedAt: new Date().toISOString() }))
    log('\n✓ Kokoro voice installed\n')
  })
  installRun = run.id
  return { runId: summary(run).id }
}
