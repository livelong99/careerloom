import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createSttAdapter, listSttModels } from './engines'
import { installCommands, removeHfModel } from './install'
import { parseSelection } from './benchmark'
import { defaultEngine, defaultModel, engineDir, FASTER_WHISPER_MODELS, findSttRuntime, NEMOTRON_MODEL, NEMOTRON_REPO, NEMOTRON_REV, PINS, readyFile, STT_MODELS, venvPython, WHISPER_MODELS } from './runtime'
import { SCRIPT as HF_SCRIPT } from './hf-script'
import { SCRIPT as FW_SCRIPT } from './faster-whisper-script'
import { SCRIPT as WHISPER_SCRIPT } from './whisper-script'

const GPU = { name: 'RTX 4060', vramMb: 8188, driver: '551.23', computeCap: 8.9 }
const tmp: string[] = []
afterEach(() => { for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

function fakeInstall(engine: 'moonshine' | 'whisper-mlx' | 'faster-whisper' | 'parakeet' | 'hf', pin: string, models: string[], extra: object = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-stt-rt-')); tmp.push(root)
  const dir = engineDir(engine, root)
  fs.mkdirSync(path.dirname(venvPython(dir)), { recursive: true }); fs.writeFileSync(venvPython(dir), '')
  fs.writeFileSync(readyFile(dir), JSON.stringify({ pin, models, ...extra }))
  return root
}

describe('runtime', () => {
  it('whisper on Apple silicon, moonshine on Intel Macs, Parakeet on Windows and Linux (GPU or not)', () => {
    expect(defaultEngine('darwin', 'arm64')).toBe('whisper-mlx')
    expect(defaultEngine('darwin', 'x64')).toBe('moonshine')
    for (const p of ['win32', 'linux'] as const) for (const a of ['x64', 'arm64'] as const) expect(defaultEngine(p, a), `${p} ${a}`).toBe('parakeet')
    expect(defaultModel('parakeet')).toBe('v3'); expect(defaultModel('parakeet', true)).toBe('v3')
    expect(defaultModel('whisper-mlx')).toBe('small'); expect(defaultModel('moonshine')).toBe('small')
    expect(defaultModel('faster-whisper', true)).toBe('turbo'); expect(defaultModel('faster-whisper', false)).toBe('small')
  })
  it('pins are exact and every whisper model pins a full 40-char revision', () => {
    expect(PINS['whisper-mlx']).toBe('mlx-whisper==0.4.3'); expect(PINS.moonshine).toBe('moonshine-voice==0.1.5')
    for (const m of Object.values(WHISPER_MODELS)) expect(m.rev).toMatch(/^[0-9a-f]{40}$/)
    expect(STT_MODELS['whisper-mlx']).toEqual(Object.keys(WHISPER_MODELS))
  })
  it('finds a finished install only when its pin matches', () => {
    const root = fakeInstall('whisper-mlx', PINS['whisper-mlx'], ['small'])
    expect(findSttRuntime('whisper-mlx', root)?.models).toEqual(['small'])
    expect(findSttRuntime('moonshine', root)).toBeNull()
    expect(findSttRuntime('faster-whisper', root)).toBeNull()
    const fw = fakeInstall('faster-whisper', PINS['faster-whisper'], ['turbo'], { cuda: true })
    expect(findSttRuntime('faster-whisper', fw)).toMatchObject({ models: ['turbo'], cuda: true })
    const stale = fakeInstall('whisper-mlx', 'mlx-whisper==0.0.1', ['small'])
    expect(findSttRuntime('whisper-mlx', stale)).toBeNull()
  })
})

describe('engines', () => {
  it('whisper and faster-whisper adapters are selectable', () => {
    const a = createSttAdapter({ engine: 'whisper-mlx', model: null, device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs: 650, vocab: [] })
    expect(a.id).toBe('whisper-mlx')
    expect(createSttAdapter({ engine: 'faster-whisper', model: 'small', device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs: 650, vocab: [] }).id).toBe('faster-whisper')
    expect(() => createSttAdapter({ engine: 'faster-whisper', model: 'huge', device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs: 650, vocab: [] })).toThrow(/Unknown faster-whisper model/)
  })
  it('lists every engine\'s models with sizes; the default engine\'s default model is recommended; turbo is on-demand', () => {
    const cfg = { engine: 'whisper-mlx' as const, model: null, device: 'auto' as const, language: 'en' as const, lastBenchmark: null, endSilenceMs: 650, vocab: [] }
    const rows = listSttModels(cfg, 'whisper-mlx')
    expect(rows.filter(r => r.engine === 'whisper-mlx').map(r => [r.model, r.sizeMb, r.recommended])).toEqual([['small', 481, true], ['turbo', 1600, false]])
    expect(rows.filter(r => r.engine === 'moonshine').map(r => [r.model, r.sizeMb, r.recommended])).toEqual([['tiny', 45, false], ['small', 139, false], ['medium', 269, false]])
    expect(rows.filter(r => r.engine === 'whisper-mlx').every(r => r.devices.length === 0)).toBe(true) // Metal GPU: Auto only
  })
  it('faster-whisper rows offer CUDA only when the GPU is usable; turbo is the recommended GPU model', () => {
    const cfg = { engine: 'faster-whisper' as const, model: null, device: 'auto' as const, language: 'en' as const, lastBenchmark: null, endSilenceMs: 650, vocab: [] }
    const gpu = listSttModels(cfg, 'faster-whisper', true).filter(r => r.engine === 'faster-whisper')
    expect(gpu.map(r => [r.model, r.sizeMb, r.recommended, r.devices])).toEqual([['small', 484, false, ['cpu', 'cuda']], ['turbo', 1617, true, ['cpu', 'cuda']], ['distil', 1512, false, ['cpu', 'cuda']]])
    expect(listSttModels(cfg, 'moonshine', false).filter(r => r.engine === 'faster-whisper').every(r => r.devices.join() === 'cpu')).toBe(true)
  })
})

describe('install commands', () => {
  it('whisper: pinned package, pinned HF revision fetch into the cache, self-test', () => {
    const cmds = installCommands('whisper-mlx', '/s.py', '/cache', 'small')
    expect(cmds[0]![1]).toContain(PINS['whisper-mlx'])
    const fetch = cmds.find(([l]) => l === 'Model')![1]
    expect(fetch).toEqual(['/s.py', 'fetch', WHISPER_MODELS.small.repo, WHISPER_MODELS.small.rev, '/cache'])
    expect(cmds.at(-1)![1].slice(0, 2)).toEqual(['/s.py', 'selftest'])
  })
  it('faster-whisper with CUDA: pinned ctranslate2 + nvidia wheels (no torch), pinned revision, GPU self-test', () => {
    const cmds = installCommands('faster-whisper', '/s.py', '/cache', 'turbo', true)
    const pkgs = cmds[0]![1].join(' ')
    expect(pkgs).toContain(PINS['faster-whisper']); expect(pkgs).toContain('ctranslate2==4.6.0')
    expect(pkgs).toContain('nvidia-cublas-cu12=='); expect(pkgs).toContain('nvidia-cudnn-cu12==')
    expect(pkgs).not.toMatch(/torch/)
    expect(cmds[1]![1]).toEqual(['/s.py', 'fetch', FASTER_WHISPER_MODELS.turbo.repo, FASTER_WHISPER_MODELS.turbo.rev, '/cache'])
    expect(cmds[2]![1]).toEqual(['/s.py', 'selftest', FASTER_WHISPER_MODELS.turbo.repo, FASTER_WHISPER_MODELS.turbo.rev, '/cache', 'cuda', 'float16'])
  })
  it('faster-whisper without a usable GPU installs no CUDA wheels and self-tests on CPU int8', () => {
    const cmds = installCommands('faster-whisper', '/s.py', '/c', 'small')
    expect(cmds[0]![1].join(' ')).not.toMatch(/nvidia/)
    expect(cmds[2]![1].slice(-2)).toEqual(['cpu', 'int8'])
    for (const m of Object.values(FASTER_WHISPER_MODELS)) expect(m.rev).toMatch(/^[0-9a-f]{40}$/)
  })
  it('moonshine keeps its install steps', () => {
    expect(installCommands('moonshine', '/s.py', '/c', 'small').map(([l]) => l)).toEqual(['Packages', 'Model', 'Self-test'])
  })
})

describe('whisper sidecar script', () => {
  it('never reaches the network at session time and loads the pinned local snapshot', () => {
    expect(WHISPER_SCRIPT).toContain('local_files_only=True')
    expect(WHISPER_SCRIPT).toContain('snapshot_download')
    expect(WHISPER_SCRIPT).not.toMatch(/masquerad|setproctitle/i)
  })
})

describe('faster-whisper sidecar script', () => {
  it('registers the pip CUDA DLL dirs before importing the library, decodes greedy without VAD, falls back to CPU int8, stays offline', () => {
    expect(FW_SCRIPT).toContain('os.add_dll_directory')
    expect(FW_SCRIPT.indexOf('add_cuda_libs()')).toBeLessThan(FW_SCRIPT.indexOf('from faster_whisper import'))
    for (const k of ['beam_size=1', 'condition_on_previous_text=False', 'without_timestamps=True', 'vad_filter=False', "('cpu', 'int8')", 'local_files_only=True']) expect(FW_SCRIPT).toContain(k)
    expect(FW_SCRIPT).not.toMatch(/import torch/)
  })
})

describe('not-installed engines fail with a message that says what to do', () => {
  const opts = { source: 'mic' as const, language: 'en', vocab: [], endSilenceMs: 650 }
  it('whisper without a runtime, or without the chosen model', async () => {
    const { whisperAdapter } = await import('./whisper-mlx')
    await expect(whisperAdapter('small', null).start(opts)).rejects.toThrow(/Settings → Local models/)
    const rt = { python: '/nope', script: '/nope', cache: '/nope', pin: 'x', models: ['turbo'] }
    await expect(whisperAdapter('small', rt).start(opts)).rejects.toThrow(/Local models/)
  })
  it('faster-whisper without a runtime, or without the chosen model', async () => {
    const { fasterWhisperAdapter } = await import('./faster-whisper')
    await expect(fasterWhisperAdapter('turbo', 'auto', null).start(opts)).rejects.toThrow(/Settings → Local models/)
    const rt = { python: '/nope', script: '/nope', cache: '/nope', pin: 'x', models: ['small'] }
    await expect(fasterWhisperAdapter('turbo', 'auto', rt).start(opts)).rejects.toThrow(/Local models/)
  })
  it('moonshine without a runtime', async () => {
    const { moonshineAdapter } = await import('./moonshine')
    await expect(moonshineAdapter('small', 'auto', null).start(opts)).rejects.toThrow(/Settings → Local models/)
  })
})

describe('parakeet', () => {
  it('installs small packages, one pinned 40-char model and a self-test; the script decodes whole utterances on the CPU', async () => {
    const { installCommands } = await import('./install')
    const { PARAKEET_MODELS, PARAKEET_PACKAGES } = await import('./runtime')
    const { SCRIPT } = await import('./parakeet-script')
    expect(PARAKEET_MODELS.v3.rev).toMatch(/^[0-9a-f]{40}$/)
    const cmds = installCommands('parakeet', 'x.py', '/c', 'v3')
    expect(cmds.map(c => c[0])).toEqual(['Packages', expect.stringContaining('Model'), 'Self-test'])
    expect(cmds[0]![1]).toEqual(expect.arrayContaining([...PARAKEET_PACKAGES]))
    expect(cmds[1]![1]).toEqual(['x.py', 'fetch', PARAKEET_MODELS.v3.repo, PARAKEET_MODELS.v3.rev, '/c'])
    for (const needle of ["'ev': 'ready'", "'ev': 'decoded'", 'nemo-parakeet-tdt-0.6b-v3', "quantization='int8'", 'CPUExecutionProvider']) expect(SCRIPT).toContain(needle)
  })
  it('lists the one model as the recommended CPU model and keeps the faster-whisper install working with a setuptools that still has pkg_resources', async () => {
    const { listSttModels } = await import('./engines')
    const { FASTER_WHISPER_PACKAGES } = await import('./runtime')
    const row = listSttModels({ engine: 'parakeet', model: null, device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs: 650, vocab: [] }, 'parakeet', false).find(m => m.engine === 'parakeet')!
    expect(row).toMatchObject({ model: 'v3', devices: ['cpu'], recommended: true, sizeMb: 640 })
    expect(FASTER_WHISPER_PACKAGES).toContain('setuptools==80.9.0')
  })

  it('Windows on ARM gets an onnxruntime that has a win_arm64 wheel (1.23.2 has none); everything else keeps the tested pin', async () => {
    const { installCommands } = await import('./install')
    const { parakeetPackages } = await import('./runtime')
    expect(parakeetPackages('win32', 'arm64')).toContain('onnxruntime==1.24.2')
    for (const [p, a] of [['win32', 'x64'], ['darwin', 'arm64'], ['linux', 'x64']] as const) expect(parakeetPackages(p, a)).toContain('onnxruntime==1.23.2')
    expect(installCommands('parakeet', 'x.py', '/c', 'v3', false, 'win32', 'arm64')[0]![1]).toContain('onnxruntime==1.24.2')
  })
})

describe('install rollback', () => {
  it('a failed or cancelled reinstall puts the previous ready.json back; a damaged model download is removed so a retry fetches it again', async () => {
    const fs = await import('node:fs'), os = await import('node:os'), path = await import('node:path')
    const { dropModelCache, restoreReady } = await import('./install')
    const { readyFile } = await import('./runtime')
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-stt-'))
    const prev = { python: 'p', script: 's', cache: 'c', pin: 'onnx-asr==0.12.0', models: ['v3'] }
    restoreReady(dir, prev)
    expect(JSON.parse(fs.readFileSync(readyFile(dir), 'utf8'))).toMatchObject({ pin: 'onnx-asr==0.12.0', models: ['v3'] })
    restoreReady(dir, null) // no previous install: nothing to put back
    expect(JSON.parse(fs.readFileSync(readyFile(dir), 'utf8')).models).toEqual(['v3'])
    const cache = path.join(dir, 'models'), blob = path.join(cache, 'models--istupakov--parakeet-tdt-0.6b-v3-onnx', 'blobs')
    fs.mkdirSync(blob, { recursive: true }); fs.mkdirSync(path.join(cache, 'models--other--keep'), { recursive: true })
    dropModelCache(cache, 'istupakov/parakeet-tdt-0.6b-v3-onnx')
    expect(fs.readdirSync(cache)).toEqual(['models--other--keep'])
  })
})

describe('hf engine', () => {
  const SHA = 'd'.repeat(40), CUSTOM = `acme/asr@${SHA}`
  const cfg = { engine: 'hf' as const, model: null, device: 'auto' as const, language: 'en' as const, lastBenchmark: null, endSilenceMs: 650, vocab: [] }
  it('Nemotron is the curated default on the hf engine, pinned by a full 40-char commit', () => {
    expect(NEMOTRON_REV).toMatch(/^[0-9a-f]{40}$/)
    expect(NEMOTRON_REPO).toBe('nvidia/nemotron-3.5-asr-streaming-0.6b')
    expect(STT_MODELS.hf).toEqual([NEMOTRON_MODEL]); expect(defaultModel('hf')).toBe(NEMOTRON_MODEL)
    expect(PINS.hf).toMatch(/^transformers==5\.1\d/)
  })
  it('lists the curated model plus every installed custom one; CUDA only with a usable GPU', () => {
    const root = fakeInstall('hf', PINS.hf, [CUSTOM])
    process.env.CAREERLOOM_STT_DIR = root
    try {
      const rows = listSttModels(cfg, 'whisper-mlx', true).filter(r => r.engine === 'hf')
      expect(rows.map(r => [r.model, r.installed, r.devices])).toEqual([[NEMOTRON_MODEL, false, ['cpu', 'cuda']], [CUSTOM, true, ['cpu', 'cuda']]])
      expect(listSttModels(cfg, 'whisper-mlx', false).filter(r => r.engine === 'hf')[0]!.devices).toEqual(['cpu'])
    } finally { delete process.env.CAREERLOOM_STT_DIR }
  })
  it('adapter: pinned ids only', () => {
    expect(createSttAdapter({ ...cfg, model: CUSTOM }).id).toBe('hf')
    expect(createSttAdapter(cfg).id).toBe('hf')
    expect(() => createSttAdapter({ ...cfg, model: 'owner/name' })).toThrow(/Unknown Hugging Face model/)
  })
  it('install steps are argv arrays pinned to repo + commit, never a shell string; safetensors only is enforced by the script', () => {
    const steps = installCommands('hf', '/s.py', '/cache', CUSTOM, false, 'darwin', 'arm64')
    expect(steps.map(([l]) => l.split(' ')[0])).toEqual(['PyTorch', 'Packages', 'Model', 'Self-test'])
    for (const [, argv] of steps) { expect(Array.isArray(argv)).toBe(true); for (const a of argv) expect(typeof a).toBe('string') }
    expect(steps[0]![1]).toEqual(['-m', 'pip', 'install', '--disable-pip-version-check', 'torch==2.14.1'])
    expect(steps[1]![1]).toContain(PINS.hf)
    expect(steps[2]![1]).toEqual(['/s.py', 'fetch', 'acme/asr', SHA, '/cache'])
    expect(steps[3]![1]).toEqual(['/s.py', 'selftest', 'acme/asr', SHA, '/cache', 'auto'])
  })
  it('torch comes from the CUDA index with a usable GPU, the CPU index on Linux without one, plain PyPI on macOS/Windows', () => {
    const torch = (cuda: boolean, platform: NodeJS.Platform) => installCommands('hf', '/s', '/c', CUSTOM, cuda, platform, 'x64')[0]![1].slice(4)
    expect(torch(true, 'win32')).toEqual(['torch==2.14.1', '--index-url', 'https://download.pytorch.org/whl/cu128'])
    expect(torch(false, 'linux')).toEqual(['torch==2.14.1', '--index-url', 'https://download.pytorch.org/whl/cpu'])
    expect(torch(false, 'win32')).toEqual(['torch==2.14.1'])
    expect(installCommands('hf', '/s', '/c', CUSTOM, true, 'linux', 'x64')[3]![1].at(-1)).toBe('cuda')
  })
  it('refuses a model id that is not repo@commit, even one that looks like a flag or a path', () => {
    for (const bad of ['small', 'acme/asr', '--index-url=http://x@' + SHA, '../../etc@' + SHA, `acme/asr; rm -rf ~@${SHA}`]) expect(() => installCommands('hf', '/s', '/c', bad)).toThrow(/pinned/)
  })
  it('remove deletes only that repo\'s cache folder and its ready.json entry', () => {
    const other = `acme/other@${SHA}`
    const root = fakeInstall('hf', PINS.hf, [CUSTOM, other])
    const cache = path.join(engineDir('hf', root), 'models')
    for (const d of ['models--acme--asr', 'models--acme--other']) fs.mkdirSync(path.join(cache, d), { recursive: true })
    removeHfModel(CUSTOM, root)
    expect(fs.existsSync(path.join(cache, 'models--acme--asr'))).toBe(false)
    expect(fs.existsSync(path.join(cache, 'models--acme--other'))).toBe(true)
    expect(findSttRuntime('hf', root)?.models).toEqual([other])
    expect(() => removeHfModel('../x', root)).toThrow()
  })
  it('the sidecar never trusts remote code, never downloads pickle or .py files, and loads the local snapshot only', () => {
    expect(HF_SCRIPT).toContain('trust_remote_code=False'); expect(HF_SCRIPT).not.toMatch(/trust_remote_code\s*=\s*True/)
    for (const p of ["'*.bin'", "'*.pt'", "'*.ckpt'", "'*.pkl'", "'*.py'"]) expect(HF_SCRIPT).toContain(p)
    expect(HF_SCRIPT).toContain("cfg['cache'], True)") // serve: local_files_only
    expect(HF_SCRIPT).toContain('auto_map')
  })
  it('benchmark accepts an hf selection only for a pinned id', () => {
    expect(parseSelection({ engine: 'hf', model: CUSTOM, device: 'auto' })).toEqual({ engine: 'hf', model: CUSTOM, device: 'auto' })
    expect(() => parseSelection({ engine: 'hf', model: 'small', device: 'auto' })).toThrow(/Unknown speech model/)
  })
})
