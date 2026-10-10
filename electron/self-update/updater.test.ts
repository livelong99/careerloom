import { createHash } from 'node:crypto'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { createUpdater, type UpdateProgress } from './updater'

const bytes = Buffer.from('careerloom-update-bytes'.repeat(100))
const sha = createHash('sha256').update(bytes).digest('hex')
const URL_OK = 'https://github.com/livelong99/careerloom/releases/download/v0.5.0/Careerloom-0.5.0-arm64.zip'
const asset = (over = {}) => ({ name: 'Careerloom-0.5.0-arm64.zip', size: bytes.length, url: URL_OK, sha256: sha, ...over })
const okFetch = (body: Buffer = bytes, finalUrl = URL_OK) => (async () => { const r = new Response(new Uint8Array(body), { status: 200 }); Object.defineProperty(r, 'url', { value: finalUrl }); return r }) as unknown as typeof fetch

function setup(over: Partial<Parameters<typeof createUpdater>[0]> = {}) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-upd-test-'))
  const events: UpdateProgress[] = []
  const spawn = vi.fn(() => ({ unref: vi.fn() })) as never
  const quit = vi.fn()
  const unzip = vi.fn(async (_zip: string, dest: string) => { fs.mkdirSync(path.join(dest, 'Careerloom.app'), { recursive: true }) })
  const u = createUpdater({ platform: 'darwin', exePath: '/Applications/Careerloom.app/Contents/MacOS/Careerloom', pid: 4242, tmpDir: tmp, logFile: path.join(tmp, 'u.log'), fetchImpl: okFetch(), spawn, unzip, quit, emit: e => events.push(e), ...over })
  return { u, tmp, events, spawn, quit, unzip }
}

describe('updater', () => {
  it('downloads, verifies and swaps the bundle on macOS', async () => {
    vi.useFakeTimers()
    const { u, spawn, events, quit } = setup()
    const r = await u.install(asset())
    expect(r).toEqual({ ok: true })
    expect(events.map(e => e.phase)).toEqual(expect.arrayContaining(['downloading', 'verifying', 'installing', 'restarting']))
    const [bin, args] = (spawn as unknown as { mock: { calls: [string, string[]][] } }).mock.calls[0]!
    expect(bin).toBe('/bin/sh')
    expect(args.slice(1)).toEqual(['4242', expect.stringMatching(/Careerloom\.app$/), '/Applications/Careerloom.app', '/Applications/Careerloom.app.previous', expect.stringMatching(/u\.log$/)])
    vi.advanceTimersByTime(500)
    expect(quit).toHaveBeenCalled()
    vi.useRealTimers()
  })
  it('refuses a checksum mismatch and installs nothing', async () => {
    const { u, spawn, events } = setup()
    const r = await u.install(asset({ sha256: 'b'.repeat(64) }))
    expect(r).toEqual({ ok: false, message: expect.stringMatching(/checksum/) })
    expect(spawn).not.toHaveBeenCalled()
    expect(events.at(-1)?.phase).toBe('error')
  })
  it('refuses an unverifiable release, an untrusted url and a redirect off GitHub', async () => {
    const a = setup(); expect((await a.u.install(asset({ sha256: null }))).ok).toBe(false)
    const b = setup(); expect((await b.u.install(asset({ url: 'https://evil.example/x.zip' }))).ok).toBe(false)
    const c = setup({ fetchImpl: okFetch(bytes, 'https://evil.example/x.zip') }); expect((await c.u.install(asset())).ok).toBe(false)
    for (const x of [a, b, c]) expect(x.spawn).not.toHaveBeenCalled()
  })
  it('refuses a short download', async () => {
    const { u, spawn } = setup({ fetchImpl: okFetch(bytes.subarray(0, 50)) })
    expect((await u.install(asset())).ok).toBe(false)
    expect(spawn).not.toHaveBeenCalled()
  })
  it('runs the installer silently on Windows', async () => {
    vi.useFakeTimers()
    const { u, spawn } = setup({ platform: 'win32' })
    expect((await u.install(asset({ name: 'Careerloom-Setup-0.5.0.exe', url: 'https://github.com/livelong99/careerloom/releases/download/v0.5.0/Careerloom-Setup-0.5.0.exe' }))).ok).toBe(true)
    const [bin, args] = (spawn as unknown as { mock: { calls: [string, string[]][] } }).mock.calls[0]!
    expect(bin).toMatch(/Careerloom-Setup-0\.5\.0\.exe$/)
    expect(args).toEqual(['/S', '--updated'])
    vi.useRealTimers()
  })
  it('refuses a second install while one runs', async () => {
    const { u } = setup()
    const first = u.install(asset({ sha256: 'c'.repeat(64) }))
    expect((await u.install(asset())).ok).toBe(false)
    await first
  })
})
