// macOS `say` engine: whole sentence rendered to a 24 kHz mono PCM16 WAV, then returned as one chunk (no installs needed).
import { execFile } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import { readFile, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { VoiceInfo } from '../kb/types'
import type { TtsEngine } from './adapter'

const BASE_WPM = 175
const clampRate = (speed: number) => Math.round(Math.min(350, Math.max(90, BASE_WPM * speed)))

/** `Aman (English (India)) en_IN    # sample` → English voices only, en_IN first then by name. */
export function parseSayVoices(out: string): VoiceInfo[] {
  const voices: VoiceInfo[] = []
  for (const line of out.split('\n')) {
    const m = /^(.+?)\s+([a-z]{2}_[A-Z]{2})\s+#/.exec(line)
    if (!m || !m[2].startsWith('en_')) continue
    voices.push({ engine: 'system', id: m[1].trim(), name: m[1].replace(/\s*\(.*$/, '').trim(), lang: m[2], offline: true, installed: true, sizeMb: null, note: null })
  }
  const rank = (v: VoiceInfo) => (v.lang === 'en_IN' ? 0 : 1)
  return voices.sort((a, b) => rank(a) - rank(b) || (rank(a) === 0 ? 0 : a.name.localeCompare(b.name)))
}

/** Pull the PCM payload out of a WAV (skips non-data chunks); only 24 kHz mono PCM16 is accepted. */
export function wavToPcm(buf: Buffer): ArrayBuffer {
  if (buf.length < 12 || buf.toString('ascii', 0, 4) !== 'RIFF' || buf.toString('ascii', 8, 12) !== 'WAVE') throw new Error('not a WAV file')
  let rate = 0; let bits = 0; let ch = 0
  for (let p = 12; p + 8 <= buf.length;) {
    const id = buf.toString('ascii', p, p + 4); const size = buf.readUInt32LE(p + 4)
    if (id === 'fmt ') { ch = buf.readUInt16LE(p + 10); rate = buf.readUInt32LE(p + 12); bits = buf.readUInt16LE(p + 22) }
    if (id === 'data') {
      if (rate !== 24000 || ch !== 1 || bits !== 16) throw new Error(`expected 24000 Hz mono PCM16, got ${rate} Hz ${ch} ch ${bits} bit`)
      const end = Math.min(buf.length, p + 8 + size)
      return buf.buffer.slice(buf.byteOffset + p + 8, buf.byteOffset + end) as ArrayBuffer
    }
    p += 8 + size + (size % 2)
  }
  throw new Error('WAV has no data chunk')
}

type Deps = {
  platform?: NodeJS.Platform
  exec?: (args: string[], signal?: AbortSignal) => Promise<string>
  readWav?: (path: string) => Promise<Buffer>
  tmp?: () => string
  rm?: (path: string) => Promise<void>
}
const realExec = (args: string[], signal?: AbortSignal) => new Promise<string>((res, rej) => {
  execFile('say', args, { signal, maxBuffer: 1 << 20 }, (e, out) => (e ? rej(e) : res(out)))
})

export function createSystemEngine(d: Deps = {}): TtsEngine {
  const mac = (d.platform ?? process.platform) === 'darwin'
  const exec = d.exec ?? realExec
  const tmp = d.tmp ?? (() => join(mkdtempSync(join(tmpdir(), 'cl-say-')), 'out.wav'))
  const readWav = d.readWav ?? readFile
  const del = d.rm ?? ((p: string) => rm(join(p, '..'), { recursive: true, force: true }))
  return {
    id: 'system',
    async voices() { return mac ? parseSayVoices(await exec(['-v', '?'])) : [] },
    async *synth(text, voiceId, speed, signal) {
      if (!mac) throw new Error('System voices are only available on macOS')
      if (signal.aborted) return
      const out = tmp()
      try {
        // `--` so sentence text can never be parsed as a say option (e.g. "-o /etc/passwd")
        await exec(['-v', voiceId, '-r', String(clampRate(speed)), '--file-format=WAVE', '--data-format=LEI16@24000', '-o', out, '--', text], signal)
        if (signal.aborted) return
        yield { pcm16: wavToPcm(await readWav(out)), sampleRate: 24000 as const }
      } catch (e) {
        if (signal.aborted) return
        throw e
      } finally { await del(out).catch(() => {}) }
    },
  }
}
