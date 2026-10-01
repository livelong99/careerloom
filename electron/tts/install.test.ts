// @vitest-environment node
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { PINS, MODEL_FILES, downloadVerified, findKokoro, installSteps, installSupported, requirementsText } from './install'

describe('kokoro pins', () => {
  it('every pinned wheel is exact (==) and hashed with a sha256', () => {
    expect(PINS.length).toBeGreaterThanOrEqual(15)
    for (const p of PINS) { expect(p.version).toMatch(/^\d+(\.\d+)+$/); expect(p.sha256).toMatch(/^[0-9a-f]{64}$/) }
    expect(PINS.map(p => p.name)).toEqual(expect.arrayContaining(['kokoro-onnx', 'onnxruntime']))
  })
  it('requirements text is install-grade: name==version --hash per line, nothing else', () => {
    const lines = requirementsText().trim().split('\n')
    expect(lines.length).toBe(PINS.length)
    for (const l of lines) expect(l).toMatch(/^[A-Za-z0-9_.-]+==[\d.]+ --hash=sha256:[0-9a-f]{64}$/)
  })
  it('model files carry https URLs and sha256', () => {
    for (const f of MODEL_FILES) { expect(f.url).toMatch(/^https:\/\/github\.com\//); expect(f.sha256).toMatch(/^[0-9a-f]{64}$/) }
  })
})

describe('install support and steps', () => {
  it('only macOS arm64 has pins today', () => {
    expect(installSupported('darwin', 'arm64')).toBe(true)
    expect(installSupported('darwin', 'x64')).toBe(false)
    expect(installSupported('win32', 'x64')).toBe(false)
  })
  it('pip step uses --require-hashes --no-deps with the generated requirements file', () => {
    const steps = installSteps('/d')
    const pip = steps.find(s => s.label === 'Packages')!
    expect(pip.args).toEqual(expect.arrayContaining(['-m', 'pip', 'install', '--require-hashes', '--no-deps', '-r', path.join('/d', 'requirements.txt')]))
    expect(steps.map(s => s.label)).toEqual(['Packages', 'Self-test'])
  })
})

describe('downloadVerified', () => {
  const data = Buffer.from('model-bytes')
  const sha = createHash('sha256').update(data).digest('hex')
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'dl-'))
  const resp = (b: Buffer) => (async () => new Response(new Uint8Array(b), { status: 200 })) as unknown as typeof fetch
  it('writes the file only when the hash matches', async () => {
    const dir = tmp(); const dest = path.join(dir, 'm.onnx')
    await downloadVerified('https://x/m', dest, sha, resp(data))
    expect(fs.readFileSync(dest)).toEqual(data); expect(fs.readdirSync(dir)).toEqual(['m.onnx'])
  })
  it('rejects a mismatch and leaves nothing behind', async () => {
    const dir = tmp(); const dest = path.join(dir, 'm.onnx')
    await expect(downloadVerified('https://x/m', dest, 'a'.repeat(64), resp(data))).rejects.toThrow(/checksum/i)
    expect(fs.readdirSync(dir)).toEqual([])
  })
  it('rejects http errors and non-https URLs', async () => {
    const dir = tmp()
    await expect(downloadVerified('https://x/m', path.join(dir, 'm'), sha, (async () => new Response('no', { status: 404 })) as unknown as typeof fetch)).rejects.toThrow(/404/)
    await expect(downloadVerified('http://x/m', path.join(dir, 'm'), sha, resp(data))).rejects.toThrow(/https/)
  })
})

describe('findKokoro', () => {
  it('null without ready.json; a runtime once ready and the files exist', () => {
    const dir = tmp2()
    expect(findKokoro(dir)).toBeNull()
    fs.mkdirSync(path.join(dir, 'venv/bin'), { recursive: true }); fs.mkdirSync(path.join(dir, 'bin'), { recursive: true }); fs.mkdirSync(path.join(dir, 'models'), { recursive: true })
    for (const f of ['venv/bin/python', 'bin/kokoro_sidecar.py', ...MODEL_FILES.map(m => `models/${m.file}`)]) fs.writeFileSync(path.join(dir, f), 'x')
    fs.writeFileSync(path.join(dir, 'ready.json'), JSON.stringify({ kokoro: 'other' }))
    expect(findKokoro(dir)).toBeNull() // different pin set
    fs.writeFileSync(path.join(dir, 'ready.json'), JSON.stringify({ kokoro: PINS.find(p => p.name === 'kokoro-onnx')!.version + '+' + MODEL_FILES[0].sha256.slice(0, 8) }))
    expect(findKokoro(dir)).toMatchObject({ python: path.join(dir, 'venv/bin/python') })
  })
})
function tmp2() { return fs.mkdtempSync(path.join(os.tmpdir(), 'kk-')) }
