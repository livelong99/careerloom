// Download + verify + extract one runtime archive. Node built-ins and the system `tar` only
// (bsdtar ships with macOS and Windows 10+, and reads zip; GNU tar on Linux reads tar.gz/xz).
import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import fs from 'node:fs'
import http from 'node:http'
import https from 'node:https'
import path from 'node:path'

import type { Asset } from './manifest'

const MAX_REDIRECTS = 5

export function sha256File(file: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const h = createHash('sha256')
    fs.createReadStream(file).on('data', d => h.update(d)).on('error', reject).on('end', () => resolve(h.digest('hex')))
  })
}

/** https only (plain http just for a local test server). Follows redirects; throws on non-200. */
export function downloadFile(url: string, dest: string, onProgress?: (done: number, total: number) => void, hops = 0): Promise<void> {
  const u = new URL(url)
  const local = u.hostname === '127.0.0.1' || u.hostname === 'localhost'
  if (u.protocol !== 'https:' && !(u.protocol === 'http:' && local)) return Promise.reject(new Error(`refusing non-https download: ${u.protocol}//${u.hostname}`))
  return new Promise((resolve, reject) => {
    const req = (u.protocol === 'https:' ? https : http).get(u, { headers: { 'user-agent': 'Careerloom' } }, res => {
      const code = res.statusCode ?? 0
      if (code >= 300 && code < 400 && res.headers.location) {
        res.resume()
        if (hops >= MAX_REDIRECTS) return reject(new Error('too many redirects'))
        return downloadFile(new URL(res.headers.location, u).toString(), dest, onProgress, hops + 1).then(resolve, reject)
      }
      if (code !== 200) { res.resume(); return reject(new Error(`download failed: HTTP ${code} from ${u.hostname}`)) }
      const total = Number(res.headers['content-length'] ?? 0)
      let done = 0
      const out = fs.createWriteStream(dest)
      res.on('data', (c: Buffer) => { done += c.length; onProgress?.(done, total) })
      res.on('error', reject)
      res.pipe(out)
      out.on('error', reject).on('finish', () => resolve())
    })
    req.setTimeout(60_000, () => req.destroy(new Error('download timed out')))
    req.on('error', reject)
  })
}

const tarBin = () => (process.platform === 'win32' ? path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'tar.exe') : 'tar')

export function tarArgs(file: string, into: string, strip: number): string[] {
  return ['-xf', file, '-C', into, ...(strip ? ['--strip-components', String(strip)] : [])]
}

export function extract(file: string, into: string, strip = 0): Promise<void> {
  fs.mkdirSync(into, { recursive: true })
  return new Promise((resolve, reject) => {
    execFile(tarBin(), tarArgs(file, into, strip), { windowsHide: true, timeout: 600_000, maxBuffer: 10 * 1024 * 1024 }, (err, _o, stderr) => {
      err ? reject(new Error(`extract failed (${err.message.split('\n')[0]}) ${stderr}`.trim())) : resolve()
    })
  })
}

/** Download → sha256 check → extract into `dest` (via a sibling temp dir, swapped in only on success). */
export async function installAsset(asset: Asset, dest: string, log: (t: string) => void = () => {}): Promise<void> {
  const parent = path.dirname(dest)
  fs.mkdirSync(parent, { recursive: true })
  const tag = randomUUID().slice(0, 8)
  const file = path.join(parent, `.dl-${tag}.${asset.archive === 'zip' ? 'zip' : asset.archive}`)
  const tmp = `${dest}.partial-${tag}`
  let last = 0
  try {
    log(`Downloading ${asset.url}\n`)
    await downloadFile(asset.url, file, (d, t) => {
      if (t && d / t - last >= 0.1) { last = d / t; log(`  ${Math.round((d / t) * 100)}% of ${(t / 1e6).toFixed(0)} MB\n`) }
    })
    const got = await sha256File(file)
    if (got !== asset.sha256.toLowerCase()) throw new Error(`checksum mismatch (expected ${asset.sha256}, got ${got}) — the download was corrupted or tampered with`)
    log('Checksum OK, extracting…\n')
    await extract(file, tmp, asset.stripComponents ?? 0)
    swapIn(tmp, dest, tag)
  } finally {
    fs.rmSync(file, { force: true })
    fs.rmSync(tmp, { recursive: true, force: true })
  }
}

/** Move `tmp` to `dest`: the old copy goes aside first and is only deleted once the new one is in place.
 *  A busy old copy (Windows EBUSY) stays behind as `.old-*` and is swept on the next pass. */
export function swapIn(tmp: string, dest: string, tag: string): void {
  const aside = `${dest}.old-${tag}`
  const had = fs.existsSync(dest)
  if (had) fs.renameSync(dest, aside)
  try { fs.renameSync(tmp, dest) } catch (e) {
    if (had) fs.renameSync(aside, dest)
    throw e
  }
  if (had) try { fs.rmSync(aside, { recursive: true, force: true }) } catch { /* in use; swept later */ }
}

/** Remove leftovers of interrupted installs (temp downloads, half-extracted or set-aside dirs). */
export function sweepStale(dir: string): void {
  let names: string[] = []
  try { names = fs.readdirSync(dir) } catch { return }
  for (const n of names) {
    if (/^\.dl-|\.partial-|\.old-/.test(n)) try { fs.rmSync(path.join(dir, n), { recursive: true, force: true }) } catch { /* busy; next pass */ }
  }
}
