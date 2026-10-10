// Minimal, defensive .zip extractor (stored + deflate, no ZIP64, no encryption). Written against
// untrusted input: every entry is checked before a byte is written. ponytail: whole archive is read into memory (capped).
import fs from 'node:fs'
import path from 'node:path'
import { inflateRawSync } from 'node:zlib'

import { SkillError } from './parse'
import { SKILL_LIMITS } from './types'

const EOCD = 0x06054b50
const CEN = 0x02014b50
const LOC = 0x04034b50
/** Archives may be bigger than the extracted skill (compression), but not by much. */
const MAX_ARCHIVE_BYTES = SKILL_LIMITS.maxBytes * 2

export type ZipEntry = { name: string; method: number; compressed: number; size: number; offset: number; mode: number; dir: boolean }

/** Clean relative path for an entry name, or throws on traversal, absolute paths and drive letters. */
export function safeEntryPath(name: string): string {
  const n = name.replaceAll('\\', '/')
  if (!n || n.includes('\0') || n.startsWith('/') || /^[A-Za-z]:/.test(n) || n.split('/').includes('..')) throw new SkillError(`Unsafe path in zip: ${JSON.stringify(name)}`, 'unsafe')
  return path.posix.normalize(n).replace(/^\.\//, '')
}

export function listZip(buf: Buffer): ZipEntry[] {
  let eocd = -1
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) if (buf.readUInt32LE(i) === EOCD) { eocd = i; break }
  if (eocd < 0) throw new SkillError('Not a valid .zip file')
  const count = buf.readUInt16LE(eocd + 10)
  let p = buf.readUInt32LE(eocd + 16)
  if (count === 0xffff || p === 0xffffffff) throw new SkillError('ZIP64 archives are not supported')
  if (count > SKILL_LIMITS.maxFiles * 2) throw new SkillError(`The zip has more than ${SKILL_LIMITS.maxFiles * 2} entries`, 'limits')
  const out: ZipEntry[] = []
  for (let i = 0; i < count; i++) {
    if (p + 46 > buf.length || buf.readUInt32LE(p) !== CEN) throw new SkillError('The zip is corrupt (bad central directory)')
    const flags = buf.readUInt16LE(p + 8)
    if (flags & 1) throw new SkillError('Encrypted zips are not supported')
    const nameLen = buf.readUInt16LE(p + 28)
    const skip = nameLen + buf.readUInt16LE(p + 30) + buf.readUInt16LE(p + 32)
    const name = buf.toString('utf8', p + 46, p + 46 + nameLen)
    const madeBy = buf.readUInt16LE(p + 4) >> 8 // 3 = unix: the high 16 bits of the external attrs are st_mode
    const mode = madeBy === 3 ? buf.readUInt32LE(p + 38) >>> 16 : 0
    out.push({ name, method: buf.readUInt16LE(p + 10), compressed: buf.readUInt32LE(p + 20), size: buf.readUInt32LE(p + 24), offset: buf.readUInt32LE(p + 42), mode, dir: name.endsWith('/') })
    p += 46 + skip
  }
  return out
}

/** Extracts into `dest` (must exist). Symlink entries are refused outright. */
export function extractZip(file: string, dest: string): void {
  const st = fs.statSync(file)
  if (!st.isFile()) throw new SkillError('Pick a .zip file')
  if (st.size > MAX_ARCHIVE_BYTES) throw new SkillError(`The zip is larger than ${MAX_ARCHIVE_BYTES / 1024 / 1024} MB`, 'limits')
  const buf = fs.readFileSync(file)
  const entries = listZip(buf)
  const files = entries.filter(e => !e.dir)
  if (files.length > SKILL_LIMITS.maxFiles) throw new SkillError(`The skill has more than ${SKILL_LIMITS.maxFiles} files`, 'limits')
  if (files.reduce((n, e) => n + e.size, 0) > SKILL_LIMITS.maxBytes) throw new SkillError(`The skill is larger than ${SKILL_LIMITS.maxBytes / 1024 / 1024} MB`, 'limits')
  const root = path.resolve(dest)
  for (const e of entries) {
    const rel = safeEntryPath(e.name)
    if ((e.mode & 0o170000) === 0o120000) throw new SkillError(`The zip contains a symlink (${e.name}); symlinks are not allowed`, 'unsafe')
    const target = path.resolve(root, rel)
    if (target !== root && !target.startsWith(root + path.sep)) throw new SkillError(`Unsafe path in zip: ${JSON.stringify(e.name)}`, 'unsafe')
    if (e.dir) { fs.mkdirSync(target, { recursive: true }); continue }
    if (buf.readUInt32LE(e.offset) !== LOC) throw new SkillError('The zip is corrupt (bad local header)')
    const start = e.offset + 30 + buf.readUInt16LE(e.offset + 26) + buf.readUInt16LE(e.offset + 28)
    const raw = buf.subarray(start, start + e.compressed)
    let data: Buffer
    if (e.method === 0) data = raw
    else if (e.method === 8) {
      try { data = inflateRawSync(raw, { maxOutputLength: e.size + 1 }) } catch { throw new SkillError(`${e.name} did not unpack to its declared size`, 'limits') }
    } else throw new SkillError(`Unsupported zip compression (method ${e.method})`)
    if (data.length !== e.size) throw new SkillError(`${e.name} did not unpack to its declared size`, 'limits')
    fs.mkdirSync(path.dirname(target), { recursive: true })
    fs.writeFileSync(target, data, { mode: e.mode & 0o111 ? 0o755 : 0o644 })
  }
}
