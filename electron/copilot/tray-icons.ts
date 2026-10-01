// Menu-bar icons drawn at runtime (a dot and a ring), so no binary assets ship and packaging is unchanged.
import zlib from 'node:zlib'

const CRC = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0 })
const crc32 = (b: Buffer): number => { let c = 0xffffffff; for (const x of b) c = CRC[(c ^ x) & 0xff]! ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0 }

function chunk(type: string, data: Buffer): Buffer {
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data])
  const out = Buffer.alloc(body.length + 8)
  out.writeUInt32BE(data.length, 0)
  body.copy(out, 4)
  out.writeUInt32BE(crc32(body), body.length + 4)
  return out
}

/** Idle ring colour. macOS tints a black template image itself; Windows has no template images, so a black ring
 *  vanishes on the dark taskbar — use mid-gray, which reads on both light and dark. */
export const idleRgb = (platform: NodeJS.Platform = process.platform): [number, number, number] => (platform === 'win32' ? [150, 150, 150] : [0, 0, 0])

/** `idle` = ring (macOS template image, the OS tints it); `live` = red dot (coloured, not a template). */
export function statusIconPng(kind: 'idle' | 'live', size: number, idle: [number, number, number] = [0, 0, 0]): Buffer {
  const c = (size - 1) / 2, rOut = size * 0.36, rIn = size * 0.24
  const [r, g, b] = kind === 'live' ? [229, 72, 77] : idle
  const rows = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    rows[y * (size * 4 + 1)] = 0 // filter: none
    for (let x = 0; x < size; x++) {
      const d = Math.hypot(x - c, y - c)
      const edge = Math.min(1, Math.max(0, rOut - d + 0.5)) // anti-aliased outer edge
      const hole = kind === 'idle' ? Math.min(1, Math.max(0, rIn - d + 0.5)) : 0
      const o = y * (size * 4 + 1) + 1 + x * 4
      rows[o] = r; rows[o + 1] = g; rows[o + 2] = b; rows[o + 3] = Math.round(255 * edge * (1 - hole))
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6 // 8-bit RGBA
  return Buffer.concat([Buffer.from('89504e470d0a1a0a', 'hex'), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(rows)), chunk('IEND', Buffer.alloc(0))])
}
