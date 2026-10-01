// Sidecar wire format, main → python: [type u8][length u32 BE][payload]. python → main is JSON lines.
export const FRAME = { config: 1, pcm: 2, flush: 3, decode: 4 } as const
export type Frame = { type: number; payload: Buffer }

export function encodeFrame(type: number, payload: Uint8Array): Buffer {
  const head = Buffer.alloc(5)
  head[0] = type
  head.writeUInt32BE(payload.byteLength, 1)
  return Buffer.concat([head, payload])
}

/** Whole frames in `buf`, plus the unconsumed tail (a partial frame). */
export function decodeFrames(buf: Buffer): { frames: Frame[]; rest: Buffer } {
  const frames: Frame[] = []
  let off = 0
  while (buf.length - off >= 5) {
    const len = buf.readUInt32BE(off + 1)
    if (buf.length - off - 5 < len) break
    frames.push({ type: buf[off]!, payload: buf.subarray(off + 5, off + 5 + len) })
    off += 5 + len
  }
  return { frames, rest: buf.subarray(off) }
}

/** Splits a child's stdout chunks into lines (python → main is JSON lines); partial lines wait for the next chunk. */
export function lineSplitter(onLine: (line: string) => void): (chunk: Buffer) => void {
  let tail = Buffer.alloc(0)
  return chunk => {
    tail = Buffer.concat([tail, chunk])
    let nl: number
    while ((nl = tail.indexOf(10)) >= 0) {
      const line = tail.subarray(0, nl).toString('utf8').trim()
      tail = tail.subarray(nl + 1)
      if (line) onLine(line)
    }
  }
}
