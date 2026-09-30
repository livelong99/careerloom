// Adapter contract: the same assertions run against the fake replay and, with CL_LIVE_STT=1 (local model,
// cost $0; needs CAREERLOOM_STT_DIR or an install in ~/.careerloom/stt and macOS `say`), the real Moonshine adapter.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import type { SttAdapter, SttEvent } from './adapter'
import { createFakeAdapter, parseFixture } from './fake'
import { findSttRuntime } from './runtime'
import { moonshineAdapter } from './moonshine'

const LIVE = process.env.CL_LIVE_STT === '1'
const PHRASE = 'Tell me about a time you led a project under a tight deadline.'
const OPTS = { source: 'mic' as const, language: 'en', vocab: [], endSilenceMs: 700 }

/** 16 kHz mono PCM16 frames of `say` speech (+ 2 s of silence so the engine sees the end of the turn). */
function speech(): { frames: ArrayBuffer[]; speechFrames: number } {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-stt-'))
  const aiff = path.join(dir, 's.aiff'), wav = path.join(dir, 's.wav')
  execFileSync('say', ['-o', aiff, PHRASE]); execFileSync('afconvert', ['-f', 'WAVE', '-d', 'LEI16@16000', '-c', '1', aiff, wav])
  const buf = fs.readFileSync(wav)
  const at = buf.indexOf('data') + 8
  const speechBytes = buf.length - at
  const pcm = Buffer.concat([buf.subarray(at), Buffer.alloc(64_000)])
  fs.rmSync(dir, { recursive: true, force: true })
  const frames: ArrayBuffer[] = []
  for (let o = 0; o + 3200 <= pcm.length; o += 3200) frames.push(pcm.buffer.slice(pcm.byteOffset + o, pcm.byteOffset + o + 3200))
  return { frames, speechFrames: Math.ceil(speechBytes / 3200) }
}

async function run(make: () => SttAdapter, frames: ArrayBuffer[], pace = 0, speechFrames = frames.length) {
  const a = make()
  const order: string[] = [], finals: SttEvent[] = []
  let speechEndAt = 0, finalLagMs: number | null = null
  for (const ev of ['partial', 'final', 'endOfTurn', 'error', 'closed'] as const) a.on(ev, e => {
    order.push(ev)
    if (ev === 'final') { finals.push(e); finalLagMs ??= Date.now() - speechEndAt }
  })
  await a.start(OPTS)
  for (const [i, f] of frames.entries()) { if (i === speechFrames) speechEndAt = Date.now(); a.push(f); if (pace) await new Promise(r => setTimeout(r, pace)) }
  await new Promise(r => setTimeout(r, LIVE ? 1500 : 10))
  await a.stop()
  return { order, finals, finalLagMs }
}

describe('SttAdapter contract', () => {
  it('fake: partial → final → endOfTurn in order, closed last', async () => {
    const fx = parseFixture([{ atMs: 200, ev: 'partial', text: 'tell me', t0: 0, t1: 200 }, { atMs: 600, ev: 'final', text: PHRASE, t0: 0, t1: 600 }, { atMs: 600, ev: 'endOfTurn', text: '', t0: 600, t1: 600 }].map(e => JSON.stringify(e)).join('\n'))
    const r = await run(() => createFakeAdapter(fx), Array.from({ length: 20 }, () => new Int16Array(1600).buffer))
    expect(r.order).toEqual(['partial', 'final', 'endOfTurn', 'closed'])
    expect(r.finals[0]!.text).toBe(PHRASE)
  })

  it.skipIf(!LIVE || !findSttRuntime('moonshine'))('moonshine (live, local model): transcribes speech, final then endOfTurn, closed on stop', async () => {
    const sp = speech()
    const r = await run(() => moonshineAdapter('small', 'auto'), sp.frames, 100, sp.speechFrames)
    expect(r.order.at(-1)).toBe('closed')
    expect(r.order).toContain('final')
    expect(r.order.indexOf('final')).toBeLessThan(r.order.indexOf('endOfTurn'))
    const text = r.finals.map(f => f.text).join(' ').toLowerCase()
    expect(text).toMatch(/tell me about a time/)
    expect(text).toMatch(/deadline/)
    console.info(`[live moonshine/small] final lag after the last speech frame (incl. silence wait): ${r.finalLagMs} ms; text: ${text}`)
  }, 120_000)
})
