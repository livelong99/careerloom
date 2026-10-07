import fs from 'node:fs'
import { whisperAdapter } from '../electron/copilot/stt/whisper-mlx'
const D = process.env.D!
const raw = (n: string) => new Int16Array(new Uint8Array(fs.readFileSync(`${D}/${n}.raw`)).buffer)
const sil = (ms: number) => new Int16Array(16 * ms)
const hiss = (ms: number, rms: number) => { const a = new Int16Array(16 * ms); for (let i = 0; i < a.length; i++) a[i] = Math.round((Math.random() * 2 - 1) * rms * 1.732 * 32767); return a }
const cat = (...p: Int16Array[]) => { const o = new Int16Array(p.reduce((s, x) => s + x.length, 0)); let k = 0; for (const x of p) { o.set(x, k); k += x.length } return o }
const rms = (x: Int16Array) => Math.sqrt(x.reduce((s, v) => s + (v / 32768) ** 2, 0) / x.length)
const speechRms = rms(raw('d')); console.log('tts rms', speechRms.toFixed(3))
const cases: Record<string, [Int16Array, number]> = {
  'baseline "Tell me about yourself?"': [cat(raw('e'), sil(4000)), 1],
  'mid-question pause 1.5s ("...migration and" | "what you learned")': [cat(raw('a'), sil(1500), raw('b'), sil(4500)), 1],
  'mid-question pause 2.5s': [cat(raw('a'), sil(2500), raw('b'), sil(4500)), 1],
  'mid-question pause 3.3s': [cat(raw('a'), sil(3300), raw('b'), sil(4500)), 1],
  'statement + 2.8s pause + question (known split)': [cat(raw('c'), sil(2800), raw('d'), sil(4500)), 2],
  'loud hiss 12s only': [cat(hiss(12000, 0.08), sil(3000)), 0],
  'loud hiss 8s then speech over it': [cat(hiss(8000, 0.03), sil(500), raw('d'), sil(4500)), 1],
}
const only = process.env.ONLY
for (const [name, [pcm, want]] of Object.entries(cases)) {
  if (only && !name.includes(only)) continue
  const a = whisperAdapter('small'); const finals: string[] = []; let decodes = 0
  a.on('final', e => finals.push(`${(performance.now() - t0 | 0)}ms:${e.text.trim()}`))
  a.on('partial', () => decodes++)
  await a.start({ source: 'mic', language: 'en', vocab: [], endSilenceMs: 650, fastEndpoint: true })
  const t0 = performance.now()
  for (let i = 0; i * 1600 + 1600 <= pcm.length; i++) {
    const at = t0 + (i + 1) * 100; await new Promise(r => setTimeout(r, Math.max(0, at - performance.now())))
    a.push(pcm.slice(i * 1600, i * 1600 + 1600).buffer)
  }
  await new Promise(r => setTimeout(r, 1500)); await a.stop()
  console.log(`${finals.length === want ? 'OK  ' : 'DIFF'} want ${want} got ${finals.length} | audio ${(pcm.length / 16000).toFixed(1)}s | ${name}\n     ${finals.join('\n     ') || '(none)'}`)
}
process.exit(0)
