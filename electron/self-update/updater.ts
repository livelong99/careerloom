// Downloads the release asset, verifies its SHA-256 against GitHub's digest, then hands over to the
// platform installer. Nothing is installed unless the digest matches; there is no "skip verification".
import { createHash } from 'node:crypto'
import { spawn as nodeSpawn, execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

import { MAC_SWAP_SCRIPT } from './mac-install'
import { bundlePathFromExe, trustedAssetUrl, trustedFinalUrl, type ReleaseAsset } from './release'

export type UpdatePhase = 'idle' | 'downloading' | 'verifying' | 'installing' | 'restarting' | 'error' | 'cancelled'
export type UpdateProgress = { phase: UpdatePhase; received: number; total: number; message: string | null }
export const IDLE: UpdateProgress = { phase: 'idle', received: 0, total: 0, message: null }
const MAX_BYTES = 800 * 1024 * 1024

export type UpdaterDeps = {
  platform: string
  exePath: string
  pid: number
  tmpDir: string
  logFile: string
  fetchImpl?: typeof fetch
  spawn?: typeof nodeSpawn
  /** Unzip a macOS archive into a folder (ditto in production). */
  unzip?: (zip: string, dest: string) => Promise<void>
  quit: () => void
  emit: (p: UpdateProgress) => void
}

const ditto = (zip: string, dest: string) => new Promise<void>((res, rej) => execFile('/usr/bin/ditto', ['-x', '-k', zip, dest], err => (err ? rej(err) : res())))

export function createUpdater(d: UpdaterDeps) {
  let current: UpdateProgress = IDLE
  let controller: AbortController | null = null
  const set = (p: Partial<UpdateProgress> & { phase: UpdatePhase }) => { current = { ...current, message: null, ...p }; d.emit(current) }

  async function download(asset: ReleaseAsset, file: string, signal: AbortSignal): Promise<string> {
    if (!trustedAssetUrl(asset.url)) throw new Error('The update is not hosted where Careerloom expects.')
    if (asset.size <= 0 || asset.size > MAX_BYTES) throw new Error('The update file has an unexpected size.')
    const res = await (d.fetchImpl ?? fetch)(asset.url, { signal, redirect: 'follow' })
    if (!res.ok || !res.body) throw new Error(`Download failed (HTTP ${res.status}).`)
    if (!trustedFinalUrl(res.url || asset.url)) throw new Error('The download was redirected somewhere untrusted.')
    const hash = createHash('sha256')
    let received = 0
    set({ phase: 'downloading', received: 0, total: asset.size })
    const src = Readable.fromWeb(res.body as never)
    src.on('data', (c: Buffer) => {
      received += c.length
      hash.update(c)
      if (received > MAX_BYTES) src.destroy(new Error('The download is larger than expected.'))
      else if (received % (1024 * 1024) < c.length) set({ phase: 'downloading', received, total: asset.size })
    })
    await pipeline(src, fs.createWriteStream(file, { mode: 0o600 }), { signal })
    if (received !== asset.size) throw new Error('The download was incomplete.')
    return hash.digest('hex')
  }

  async function install(asset: ReleaseAsset): Promise<{ ok: true } | { ok: false; message: string }> {
    if (controller) return { ok: false, message: 'An update is already in progress.' }
    controller = new AbortController()
    const dir = fs.mkdtempSync(path.join(d.tmpDir, 'careerloom-update-'))
    const file = path.join(dir, asset.name)
    try {
      if (!asset.sha256) throw new Error('This release has no published checksum, so it cannot be verified. Download it from the release page instead.')
      const digest = await download(asset, file, controller.signal)
      set({ phase: 'verifying', received: asset.size, total: asset.size })
      if (digest !== asset.sha256) throw new Error('The downloaded file does not match its published checksum. Nothing was installed.')
      set({ phase: 'installing', received: asset.size, total: asset.size })
      if (d.platform === 'darwin') await installMac(file, dir)
      else if (d.platform === 'win32') installWindows(file)
      else throw new Error('In-app updates are available on macOS and Windows.')
      set({ phase: 'restarting', received: asset.size, total: asset.size })
      setTimeout(d.quit, 400)
      return { ok: true }
    } catch (err) {
      const cancelled = controller?.signal.aborted === true
      set(cancelled ? { phase: 'cancelled' } : { phase: 'error', message: (err as Error).message })
      fs.rmSync(dir, { recursive: true, force: true })
      return { ok: false, message: cancelled ? 'Update cancelled.' : (err as Error).message }
    } finally { controller = null }
  }

  async function installMac(zip: string, dir: string): Promise<void> {
    const out = path.join(dir, 'app')
    await (d.unzip ?? ditto)(zip, out)
    const app = fs.readdirSync(out).find(n => n.endsWith('.app'))
    const dest = bundlePathFromExe(d.exePath)
    if (!app || !dest) throw new Error('The downloaded update does not contain the app.')
    const script = path.join(dir, 'swap.sh')
    fs.writeFileSync(script, MAC_SWAP_SCRIPT, { mode: 0o700 })
    const child = (d.spawn ?? nodeSpawn)('/bin/sh', [script, String(d.pid), path.join(out, app), dest, `${dest}.previous`, d.logFile], { detached: true, stdio: 'ignore' })
    child.unref()
  }

  function installWindows(exe: string): void {
    // electron-builder's NSIS installer: /S is silent, --updated relaunches the app when it finishes.
    const child = (d.spawn ?? nodeSpawn)(exe, ['/S', '--updated'], { detached: true, stdio: 'ignore' })
    child.unref()
  }

  return {
    install,
    cancel: () => controller?.abort(),
    progress: () => current,
    reset: () => { if (!controller) { current = IDLE; d.emit(current) } },
  }
}
export type Updater = ReturnType<typeof createUpdater>

export const defaultTmp = (): string => os.tmpdir()
