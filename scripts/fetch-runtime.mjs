// Usage: node scripts/fetch-runtime.mjs <platform-arch>... [--out <dir>]
// Downloads, sha256-verifies and extracts node/python/git (build/runtime-manifest.json)
// into <out>/<platform-arch>/<node|python|git>. Downloads cached in build/.runtime-cache. Idempotent.
import { createHash } from 'node:crypto'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync, createWriteStream, renameSync } from 'node:fs'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const manifest = JSON.parse(readFileSync(path.join(root, 'build/runtime-manifest.json'), 'utf8'))
const args = process.argv.slice(2)
const oi = args.indexOf('--out')
const out = path.resolve(oi >= 0 ? args.splice(oi, 2)[1] : path.join(root, 'build/runtime'))
const cache = path.join(root, 'build/.runtime-cache')
// Windows: use System32 bsdtar (handles zip); Git-bash GNU tar would choke on drive letters.
const tar = process.platform === 'win32' ? path.join(process.env.SystemRoot ?? 'C:\\Windows', 'System32', 'tar.exe') : 'tar'

const sha256 = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')

async function download(url, file, want) {
  if (existsSync(file) && sha256(file) === want) return
  mkdirSync(path.dirname(file), { recursive: true })
  const res = await fetch(url, { redirect: 'follow' })
  if (!res.ok || !res.body) throw new Error(`GET ${url} -> ${res.status}`)
  const tmp = `${file}.part`
  await pipeline(Readable.fromWeb(res.body), createWriteStream(tmp))
  const got = sha256(tmp)
  if (got !== want) { rmSync(tmp); throw new Error(`sha256 mismatch for ${url}: ${got} != ${want}`) }
  renameSync(tmp, file)
}

function extract(archive, dest, strip) {
  rmSync(dest, { recursive: true, force: true })
  mkdirSync(dest, { recursive: true })
  // win32: relative archive path + cwd=dest avoids "C:" being read as a remote host
  const r = spawnSync(tar, ['-x', '-f', process.platform === 'win32' ? path.relative(dest, archive) : archive, ...(strip ? [`--strip-components=${strip}`] : [])], { cwd: dest, stdio: 'inherit' })
  if (r.status !== 0) throw new Error(`extract failed: ${archive}`)
}

const targets = args
if (!targets.length) { console.error('usage: fetch-runtime.mjs <platform-arch>... [--out dir]'); process.exit(2) }

for (const target of targets) {
  for (const tool of ['node', 'python', 'git']) {
    const a = manifest[tool].assets[target]
    if (!a) { if (tool === 'git') continue; throw new Error(`no ${tool} asset for ${target}`) }
    const dest = path.join(out, target, tool)
    const stamp = path.join(dest, '.fetched')
    if (existsSync(stamp) && readFileSync(stamp, 'utf8') === a.sha256) { console.log(`ok   ${tool} ${target} (cached)`); continue }
    const file = path.join(cache, `${a.sha256.slice(0, 12)}-${path.basename(new URL(a.url).pathname)}`)
    console.log(`get  ${tool} ${target}`)
    await download(a.url, file, a.sha256)
    extract(file, dest, a.stripComponents ?? 0)
    writeFileSync(stamp, a.sha256)
  }
}
