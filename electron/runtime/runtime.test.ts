import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import os from 'node:os'
import path from 'node:path'
import { afterAll, describe, expect, it } from 'vitest'

import { downloadFile, installAsset, sha256File, sweepStale, swapIn, tarArgs } from './download'
import { buildFailurePrompt, lastLines, redact } from './failure-prompt'
import { parseManifest, pickAsset } from './manifest'
import { toolBinSubdirs } from './paths'

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-runtime-'))
afterAll(() => fs.rmSync(tmp, { recursive: true, force: true }))

const asset = { url: 'https://x.test/a.tar.gz', sha256: 'a'.repeat(64), archive: 'tar.gz' as const, stripComponents: 1 }

describe('manifest', () => {
  const fixture = { node: { version: '22', assets: { 'win32-x64': asset } }, python: { version: '3.12', assets: {} } }
  it('parses and picks by platform-arch', () => {
    const m = parseManifest(fixture)
    expect(pickAsset(m, 'node', 'win32', 'x64')).toEqual(asset)
    expect(pickAsset(m, 'node', 'darwin', 'arm64')).toBeNull()
    expect(pickAsset(m, 'git', 'win32', 'x64')).toBeNull()
  })
  it('rejects non-https urls, bad hashes and bad archives', () => {
    for (const bad of [{ ...asset, url: 'http://x.test/a' }, { ...asset, sha256: 'zz' }, { ...asset, archive: 'rar' }]) {
      expect(() => parseManifest({ node: { version: '1', assets: { 'linux-x64': bad } } })).toThrow()
    }
  })
  it('accepts the shipped manifest', async () => {
    const raw = JSON.parse(fs.readFileSync(path.join(__dirname, '../../build/runtime-manifest.json'), 'utf8'))
    expect(() => parseManifest(raw)).not.toThrow()
  })
})

describe('paths', () => {
  it('uses the agreed layouts', () => {
    expect(toolBinSubdirs('node', 'darwin')).toEqual(['bin'])
    expect(toolBinSubdirs('node', 'win32')).toEqual([''])
    expect(toolBinSubdirs('git', 'win32')).toEqual(['cmd', path.join('usr', 'bin')])
  })
})

describe('failure prompt', () => {
  it('redacts home, user and secrets', () => {
    const out = redact('cd /Users/alice/proj; key=sk-abcdefghijklmnop1234 token: ghp_abcdefghijklmnopqrst Bearer abcdefgh12345678 alice', '/Users/alice', 'alice')
    expect(out).not.toMatch(/alice|sk-abc|ghp_|abcdefgh12345678/)
    expect(out).toContain('~/proj')
  })
  it('matches single Windows backslashes, URL credentials, emails, short and spaced names', () => {
    const home = 'C:\\Users\\Al Bo'
    const out = redact('open C:\\Users\\Al Bo\\x and C:/Users/Al Bo/y; https://me:pw@host/r mail a.b@ex.com', home, 'Al Bo')
    expect(out).not.toMatch(/Al Bo|me:pw|a\.b@/)
    expect(redact('/home/jo/x jo went', '/home/jo', 'jo')).toBe('~/x jo went')
    expect(redact('D:\\u\\file', 'C:\\Users\\zed', 'u')).toBe('D:\\<user>\\file')
  })
  it('keeps only the last 60 lines', () => {
    const log = Array.from({ length: 100 }, (_, i) => `line ${i}`).join('\n')
    expect(lastLines(log).split('\n')).toHaveLength(60)
    expect(lastLines(log)).toContain('line 99')
    expect(lastLines(log)).not.toContain('line 39\n')
  })
  it('is self-contained', () => {
    const p = buildFailurePrompt({ stepId: 'node', label: 'Node.js', command: 'npm i', exitCode: 3, error: 'boom', log: 'a\nb', verify: 'node --version', runtimeDir: '/Users/bob/.careerloom/runtime', platform: 'darwin', arch: 'arm64', osVersion: '25', home: '/Users/bob', user: 'bob' })
    for (const s of ['`node`', 'exit code 3', 'darwin arm64', '~/.careerloom/runtime', 'node --version', 'Retry', 'without sudo']) expect(p).toContain(s)
    expect(p).not.toContain('bob')
  })
})

describe('download + extract', () => {
  const src = path.join(tmp, 'src')
  fs.mkdirSync(path.join(src, 'top'), { recursive: true })
  fs.writeFileSync(path.join(src, 'top', 'hello.txt'), 'hi')
  const archive = path.join(tmp, 'a.tar.gz')
  execFileSyncTar(['-czf', archive, '-C', src, 'top'])
  const body = fs.readFileSync(archive)
  const server = http.createServer((_q, r) => r.end(body))
  const listening = new Promise<number>(res => server.listen(0, '127.0.0.1', () => res((server.address() as { port: number }).port)))
  afterAll(() => { server.close() })

  it('downloads, verifies sha256, strips components', async () => {
    const url = `http://127.0.0.1:${await listening}/a.tar.gz`
    const sha = createHash('sha256').update(body).digest('hex')
    const dest = path.join(tmp, 'out')
    await installAsset({ url, sha256: sha, archive: 'tar.gz', stripComponents: 1 }, dest)
    expect(fs.readFileSync(path.join(dest, 'hello.txt'), 'utf8')).toBe('hi')
    expect(await sha256File(archive)).toBe(sha)
    expect(fs.readdirSync(tmp).filter(f => f.startsWith('.dl-') || f.includes('.partial'))).toEqual([])
  })
  it('rejects a checksum mismatch and leaves dest untouched', async () => {
    const url = `http://127.0.0.1:${await listening}/a.tar.gz`
    const dest = path.join(tmp, 'out2')
    await expect(installAsset({ url, sha256: 'b'.repeat(64), archive: 'tar.gz' }, dest)).rejects.toThrow(/checksum/)
    expect(fs.existsSync(dest)).toBe(false)
  })
  it('refuses plain http to a remote host', async () => {
    await expect(downloadFile('http://example.com/x', path.join(tmp, 'x'))).rejects.toThrow(/non-https/)
  })
  it('swaps in keeping the old copy until the new one is placed, and sweeps leftovers', () => {
    const d = path.join(tmp, 'swap')
    fs.mkdirSync(d)
    fs.mkdirSync(path.join(d, 'tool')); fs.writeFileSync(path.join(d, 'tool', 'v'), 'old')
    fs.mkdirSync(path.join(d, 'new')); fs.writeFileSync(path.join(d, 'new', 'v'), 'new')
    swapIn(path.join(d, 'new'), path.join(d, 'tool'), 't1')
    expect(fs.readFileSync(path.join(d, 'tool', 'v'), 'utf8')).toBe('new')
    expect(fs.readdirSync(d)).toEqual(['tool'])
    expect(() => swapIn(path.join(d, 'missing'), path.join(d, 'tool'), 't2')).toThrow()
    expect(fs.readFileSync(path.join(d, 'tool', 'v'), 'utf8')).toBe('new') // rolled back
    fs.mkdirSync(path.join(d, 'tool.partial-x')); fs.writeFileSync(path.join(d, '.dl-y.zip'), '')
    sweepStale(d)
    expect(fs.readdirSync(d)).toEqual(['tool'])
  })
  it('builds tar args', () => {
    expect(tarArgs('f', 'd', 1)).toEqual(['-xf', 'f', '-C', 'd', '--strip-components', '1'])
    expect(tarArgs('f', 'd', 0)).toEqual(['-xf', 'f', '-C', 'd'])
  })
})

function execFileSyncTar(args: string[]) { execFileSync('tar', args) }
