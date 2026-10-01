#!/usr/bin/env node
// End-of-speech -> final transcript latency, before vs after PERF-2 adaptive endpointing, on the S2 benchmark fixture
// (4 interview sentences spoken by the macOS voice, 1.6 s of silence after each; SYNTHETIC speech: cleaner than a call).
//   npm run build:electron && node scripts/copilot-endpoint-bench.mjs --stt-dir <scratch dir> --passes 3
// Runs the real Whisper (MLX) sidecar, one process at a time, paced in real time. Never touches ~/.careerloom: --stt-dir is
// a scratch directory with whisper-mlx/venv (pip install mlx-whisper==0.4.3); the pinned model is read from the HF hub cache.
import { createRequire } from 'node:module'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist/electron')
const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, all) => (a.startsWith('--') ? [[a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? 'true' : all[i + 1]]] : [])))
const sttDir = resolve(args['stt-dir'] ?? '')
if (!args['stt-dir'] || sttDir === path.join(os.homedir(), '.careerloom', 'stt')) { console.error('Pass --stt-dir <scratch dir> (never the real ~/.careerloom/stt).'); process.exit(2) }
process.env.CAREERLOOM_STT_DIR = sttDir
const passes = Number(args.passes ?? 3), endSilenceMs = Number(args['end-silence'] ?? 650)

const { loadFixture } = require(join(dist, 'copilot/stt/bench-fixture.js'))
const { createSttAdapter } = require(join(dist, 'copilot/stt/engines.js'))
const { PINS, WHISPER_MODELS, engineDir, readyFile } = require(join(dist, 'copilot/stt/runtime.js'))
const { whisperScript } = require(join(dist, 'copilot/stt/whisper-script.js'))

// Scratch runtime: script + model cache (the pinned snapshot from the HF hub cache) + ready marker.
const dir = engineDir('whisper-mlx', sttDir)
fs.mkdirSync(join(dir, 'bin'), { recursive: true })
whisperScript(join(dir, 'bin'))
const hub = join(os.homedir(), '.cache/huggingface/hub')
const rev = WHISPER_MODELS.small.rev
if (!fs.existsSync(join(hub, 'models--mlx-community--whisper-small-mlx/snapshots', rev))) { console.error('Pinned whisper-small snapshot missing from the HF hub cache.'); process.exit(2) }
if (!fs.existsSync(join(dir, 'models'))) fs.symlinkSync(hub, join(dir, 'models'))
fs.writeFileSync(readyFile(dir), JSON.stringify({ pin: PINS['whisper-mlx'], models: ['small'], installedAt: new Date().toISOString() }))

const pct = (xs, p) => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(p * xs.length) - 1)] : null)
const sleep = ms => new Promise(r => setTimeout(r, ms))
const fixture = await loadFixture()
const FRAME = 1600 // 100 ms of 16 kHz samples

async function pass(fastEndpoint) {
  const a = createSttAdapter({ engine: 'whisper-mlx', model: 'small', device: 'auto', language: 'en', lastBenchmark: null, endSilenceMs, vocab: [] })
  const finals = []
  let t0 = 0
  a.on('final', e => finals.push({ at: performance.now() - t0, text: e.text }))
  await a.start({ source: 'system', language: 'en', vocab: [], endSilenceMs, fastEndpoint })
  t0 = performance.now()
  for (let i = 0, f = 0; i * FRAME < fixture.pcm.length; i++, f++) {
    a.push(fixture.pcm.slice(i * FRAME, (i + 1) * FRAME).buffer)
    await sleep(Math.max(0, (f + 1) * 100 - (performance.now() - t0)))
  }
  await sleep(3000)
  await a.stop()
  return fixture.utterances.map((u, i) => (finals[i] ? { latency: finals[i].at - u.endMs, text: finals[i].text } : null))
}

const out = {}
for (const [name, fast] of [['baseline', false], ['adaptive', true], ['baseline', false], ['adaptive', true]].slice(0, passes > 1 ? 4 : 2)) {
  const rows = (await pass(fast)).filter(Boolean)
  ;(out[name] ??= { latencies: [], finalsPerPass: [], sample: rows.map(r => r.text) }).latencies.push(...rows.map(r => r.latency))
  out[name].finalsPerPass.push(rows.length)
  console.error(`${name}: ${rows.map(r => Math.round(r.latency)).join(', ')} ms`)
}
const report = { at: new Date().toISOString(), node: process.version, os: `${os.type()} ${os.release()} ${os.arch()}`, model: 'whisper-mlx small', endSilenceMs, synthetic: true,
  results: Object.fromEntries(Object.entries(out).map(([k, v]) => [k, { n: v.latencies.length, finalsPerPass: v.finalsPerPass, p50: pct(v.latencies, 0.5), p95: pct(v.latencies, 0.95), min: Math.min(...v.latencies), sample: v.sample }])) }
const dirOut = join(root, 'docs/plans/interview-copilot/measurements')
fs.mkdirSync(dirOut, { recursive: true })
const file = join(dirOut, `perf2-endpoint-${report.at.replace(/[:.]/g, '-')}.json`)
fs.writeFileSync(file, JSON.stringify(report, null, 2) + '\n')
console.log(JSON.stringify(report.results, null, 2)); console.error(`wrote ${file}`)
