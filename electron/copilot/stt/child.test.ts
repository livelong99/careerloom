import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'

import { setDebugLogDir } from '../../debug-log'
import { spawnSidecarChild } from './child'

afterEach(() => setDebugLogDir(null))

describe('spawnSidecarChild', () => {
  it('writes the sidecar stderr and its exit code to the debug log, so a crash is diagnosable', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-child-'))
    const script = path.join(dir, 'boom.js')
    fs.writeFileSync(script, "console.error('ModuleNotFoundError: No module named onnx_asr'); process.exit(3)")
    setDebugLogDir(dir)
    const c = spawnSidecarChild({ python: process.execPath, script, cache: '', pin: '', models: [] })
    await new Promise<void>(r => c.onExit(() => r()))
    await new Promise(r => setTimeout(r, 50))
    const log = fs.readdirSync(dir).filter(f => f.endsWith('.log')).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('')
    expect(log).toContain('ModuleNotFoundError: No module named onnx_asr')
    expect(log).toMatch(/"msg":"exit".*"code":3/)
  })

  it('reports a python that cannot start as an exit (no ready-timeout hang) and logs why', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-child-'))
    setDebugLogDir(dir)
    const c = spawnSidecarChild({ python: path.join(dir, 'parakeet', 'venv', 'bin', 'python'), script: 'x.py', cache: '', pin: '', models: [] })
    const code = await Promise.race([new Promise<number | null>(r => c.onExit(r)), new Promise<string>(r => setTimeout(() => r('hung'), 2000))])
    expect(code).toBeNull()
    expect(fs.readdirSync(dir).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('')).toContain('spawn failed')
  })

  it('caps the stderr lines logged per process: a library warning on every frame cannot fill the log', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-child-'))
    const script = path.join(dir, 'noisy.js')
    fs.writeFileSync(script, "for (let i = 0; i < 5000; i++) console.error('warning ' + i)")
    setDebugLogDir(dir)
    const c = spawnSidecarChild({ python: process.execPath, script, cache: '', pin: '', models: [] })
    await new Promise<void>(r => c.onExit(() => r()))
    await new Promise(r => setTimeout(r, 50))
    const log = fs.readdirSync(dir).filter(f => f.endsWith('.log')).map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('')
    const lines = log.split('\n').filter(l => l.includes('"msg":"stderr"')).length
    expect(lines).toBeLessThanOrEqual(201)
    expect(log).toContain('further stderr lines not logged')
    expect(log).toMatch(/"msg":"exit"/)
  })
})
