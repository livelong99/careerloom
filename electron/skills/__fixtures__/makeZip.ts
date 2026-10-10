// Test helper: builds a .zip in memory (deflate or stored) so traversal and symlink cases can be forged.
import { crc32, deflateRawSync } from 'node:zlib'

export type ZipSpec = { name: string; data?: string | Buffer; /** unix st_mode (e.g. 0o120777 for a symlink) */ mode?: number; stored?: boolean; /** lie about the uncompressed size */ declaredSize?: number }

export function makeZip(specs: ZipSpec[]): Buffer {
  const locals: Buffer[] = []
  const centrals: Buffer[] = []
  let offset = 0
  for (const s of specs) {
    const raw = Buffer.from(s.data ?? '')
    const method = s.stored ? 0 : 8
    const body = s.stored ? raw : deflateRawSync(raw)
    const name = Buffer.from(s.name)
    const size = s.declaredSize ?? raw.length
    const local = Buffer.alloc(30)
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(method, 8)
    local.writeUInt32LE(crc32(raw), 14); local.writeUInt32LE(body.length, 18); local.writeUInt32LE(size, 22); local.writeUInt16LE(name.length, 26)
    const cen = Buffer.alloc(46)
    cen.writeUInt32LE(0x02014b50, 0); cen.writeUInt16LE((3 << 8) | 20, 4); cen.writeUInt16LE(20, 6); cen.writeUInt16LE(method, 10)
    cen.writeUInt32LE(crc32(raw), 16); cen.writeUInt32LE(body.length, 20); cen.writeUInt32LE(size, 24); cen.writeUInt16LE(name.length, 28)
    cen.writeUInt32LE(((s.mode ?? (s.name.endsWith('/') ? 0o40755 : 0o100644)) << 16) >>> 0, 38); cen.writeUInt32LE(offset, 42)
    locals.push(local, name, body)
    centrals.push(cen, name)
    offset += 30 + name.length + body.length
  }
  const cd = Buffer.concat(centrals)
  const end = Buffer.alloc(22)
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(specs.length, 8); end.writeUInt16LE(specs.length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, end])
}
