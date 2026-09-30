import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { createSttAdapter, listSttModels } from './engines'
import { installCommands } from './install'
import { defaultEngine, defaultModel, engineDir, findSttRuntime, PINS, readyFile, STT_MODELS, venvPython, WHISPER_MODELS } from './runtime'
import { SCRIPT as WHISPER_SCRIPT } from './whisper-script'

const tmp: string[] = []
afterEach(() => { for (const d of tmp.splice(0)) fs.rmSync(d, { recursive: true, force: true }) })

function fakeInstall(engine: 'moonshine' | 'whisper-mlx', pin: string, models: string[]) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-stt-rt-')); tmp.push(root)
  const dir = engineDir(engine, root)
  fs.mkdirSync(path.dirname(venvPython(dir)), { recursive: true }); fs.writeFileSync(venvPython(dir), '')
  fs.writeFileSync(readyFile(dir), JSON.stringify({ pin, models }))
  return root
}

describe('runtime', () => {
  it('whisper is the default on Apple silicon, moonshine elsewhere', () => {
    expect(defaultEngine('darwin', 'arm64')).toBe('whisper-mlx')
    expect(defaultEngine('darwin', 'x64')).toBe('moonshine')
    expect(defaultEngine('win32', 'x64')).toBe('moonshine')
    expect(defaultModel('whisper-mlx')).toBe('small'); expect(defaultModel('moonshine')).toBe('small')
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
    const stale = fakeInstall('whisper-mlx', 'mlx-whisper==0.0.1', ['small'])
    expect(findSttRuntime('whisper-mlx', stale)).toBeNull()
  })
})

describe('engines', () => {
  it('whisper adapter is selectable; faster-whisper still is not', () => {
    const a = createSttAdapter({ engine: 'whisper-mlx', model: null, device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs: 650, vocab: [] })
    expect(a.id).toBe('whisper-mlx')
    expect(() => createSttAdapter({ engine: 'faster-whisper', model: null, device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs: 650, vocab: [] })).toThrow(/not available/)
  })
  it('lists every engine\'s models with sizes; the default engine\'s default model is recommended; turbo is on-demand', () => {
    const cfg = { engine: 'whisper-mlx' as const, model: null, device: 'auto' as const, language: 'en' as const, lastBenchmark: null, endSilenceMs: 650, vocab: [] }
    const rows = listSttModels(cfg, 'whisper-mlx')
    expect(rows.filter(r => r.engine === 'whisper-mlx').map(r => [r.model, r.sizeMb, r.recommended])).toEqual([['small', 481, true], ['turbo', 1600, false]])
    expect(rows.filter(r => r.engine === 'moonshine').map(r => [r.model, r.sizeMb, r.recommended])).toEqual([['tiny', 45, false], ['small', 139, false], ['medium', 269, false]])
    expect(rows.filter(r => r.engine === 'whisper-mlx').every(r => r.devices.length === 0)).toBe(true) // Metal GPU: Auto only
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
