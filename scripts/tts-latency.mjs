#!/usr/bin/env node
// First-audio latency per TTS engine (manual gate G-T; ONE engine per run: the 16 GB Mac holds one heavy process at a time).
//   node scripts/tts-latency.mjs --engine system [--voice Rishi] [--n 8] [--out dir]
//   node scripts/tts-latency.mjs --engine kokoro [--dir ~/.careerloom/tts]        (needs the Settings install)
//   CL_LIVE_TTS=1 OPENROUTER_API_KEY=... node scripts/tts-latency.mjs --engine openrouter   (≈ $0.0001 per sentence)
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'

const arg = (k, d) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d }
const engine = arg('engine', 'system'); const n = Number(arg('n', 8)); const out = arg('out', null)
const SENTENCES = ['Tell me about a time you disagreed with a teammate.', 'Walk me through a project where you had to trade latency against cost, and what you decided.', 'Okay, thanks. What did you learn from that?']
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.ceil((p / 100) * s.length) - 1)] }
const rssMb = pid => Number(execFileSync('ps', ['-o', 'rss=', '-p', String(pid)]).toString().trim()) / 1024
if (out) mkdirSync(out, { recursive: true })
const save = (name, pcm) => { if (!out) return; const h = Buffer.alloc(44); h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22); h.writeUInt32LE(24000, 24); h.writeUInt32LE(48000, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40); writeFileSync(join(out, name), Buffer.concat([h, pcm])) }

async function system() {
  const voice = arg('voice', 'Rishi')
  return async text => {
    const dir = mkdtempSync(join(tmpdir(), 'ttslat-')); const f = join(dir, 'o.wav')
    const t = performance.now()
    await new Promise((res, rej) => spawn('say', ['-v', voice, '--file-format=WAVE', '--data-format=LEI16@24000', '-o', f, '--', text]).on('exit', c => (c ? rej(new Error('say failed')) : res())))
    const ms = performance.now() - t; const wav = readFileSync(f); rmSync(dir, { recursive: true, force: true })
    return { ms, pcm: wav.subarray(44), rss: null }
  }
}
async function kokoro() {
  const dir = arg('dir', join(homedir(), '.careerloom', 'tts'))
  const p = spawn(join(dir, 'venv/bin/python'), [join(dir, 'bin/kokoro_sidecar.py'), join(dir, 'models/kokoro-v1.0.int8.onnx'), join(dir, 'models/voices-v1.0.bin')], { stdio: ['pipe', 'pipe', 'ignore'] })
  let buf = Buffer.alloc(0); let waiter = null
  p.stdout.on('data', c => { buf = Buffer.concat([buf, c]); waiter?.() })
  const frame = async () => { for (;;) { if (buf.length >= 8) { const l = buf.readUInt32LE(4); if (buf.length >= 8 + l) { const f = { id: buf.readUInt32LE(0), data: buf.subarray(8, 8 + l) }; buf = buf.subarray(8 + l); return f } } await new Promise(r => { waiter = r }) } }
  const t0 = performance.now(); await frame(); console.log(`kokoro load ${((performance.now() - t0) / 1000).toFixed(2)} s, rss ${rssMb(p.pid).toFixed(0)} MB`)
  let id = 0
  const fn = async text => {
    id++; const t = performance.now(); p.stdin.write(JSON.stringify({ id, text, voice: arg('voice', 'af_heart'), speed: 1 }) + '\n')
    let first = null; const parts = []
    for (;;) { const f = await frame(); if (f.id === 0) continue; if (!f.data.length) break; first ??= performance.now() - t; parts.push(f.data) }
    return { ms: first, pcm: Buffer.concat(parts), rss: rssMb(p.pid) }
  }
  fn.close = () => { p.stdin.write('{"op":"quit"}\n'); p.kill() }
  return fn
}
async function openrouter() {
  if (process.env.CL_LIVE_TTS !== '1') { console.log('skipped: set CL_LIVE_TTS=1 and OPENROUTER_API_KEY (live spend, cap $0.50)'); process.exit(0) }
  const key = process.env.OPENROUTER_API_KEY; if (!key) throw new Error('OPENROUTER_API_KEY missing')
  return async text => {
    const t = performance.now()
    const r = await fetch('https://openrouter.ai/api/v1/audio/speech', { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${key}` }, body: JSON.stringify({ model: 'hexgrad/kokoro-82m', input: text, voice: 'af_heart', response_format: 'pcm' }) })
    if (!r.ok) throw new Error(`HTTP ${r.status}`)
    const reader = r.body.getReader(); const parts = []; let first = null
    for (;;) { const { value, done } = await reader.read(); if (done) break; first ??= performance.now() - t; parts.push(Buffer.from(value)) }
    return { ms: first, pcm: Buffer.concat(parts), rss: null }
  }
}

const synth = await ({ system, kokoro, openrouter }[engine] ?? (() => { throw new Error('--engine system|kokoro|openrouter') }))()
const times = []; const rows = []
for (let i = 0; i < n; i++) {
  const text = SENTENCES[i % SENTENCES.length]; const r = await synth(text)
  if (i > 0 || n === 1) times.push(r.ms)
  rows.push(`#${i} ${text.length}c first-audio ${r.ms.toFixed(0)} ms audio ${(r.pcm.length / 48000).toFixed(1)} s${r.rss ? ` rss ${r.rss.toFixed(0)} MB` : ''}`)
  if (i < 3) save(`${engine}-${i}.wav`, r.pcm)
}
synth.close?.()
console.log(rows.join('\n'))
console.log(`${engine}: cold ${rows[0].match(/first-audio (\d+)/)[1]} ms · warm p50 ${pct(times, 50).toFixed(0)} ms · p95 ${pct(times, 95).toFixed(0)} ms (n=${times.length})`)
