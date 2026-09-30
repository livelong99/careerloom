// Last `maxMs` of 16 kHz mono PCM16, kept so a restarted STT sidecar can replay what it missed (plan §3.2).
// Reference for the reconnect + ring-buffer idea: Open-Cluely services/assembly-ai/service.js (owner's project).
const BYTES_PER_MS = 32

export class PcmRing {
  private chunks: ArrayBuffer[] = []
  private bytes = 0
  constructor(private readonly maxMs = 10_000) {}

  push(buf: ArrayBuffer): void {
    this.chunks.push(buf)
    this.bytes += buf.byteLength
    const max = this.maxMs * BYTES_PER_MS
    while (this.chunks.length > 1 && this.bytes - this.chunks[0]!.byteLength >= max) this.bytes -= this.chunks.shift()!.byteLength
  }
  snapshot(): ArrayBuffer[] { return [...this.chunks] }
  clear(): void { this.chunks = []; this.bytes = 0 }
}
