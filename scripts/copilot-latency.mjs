#!/usr/bin/env node
// Interview Copilot latency harness (plan §12, PERF-1). Two modes, both through the real engine + OpenRouter provider + trace:
//   npm run build:electron && node scripts/copilot-latency.mjs [--runs 12] [--profile all|fast|balanced|slow-reasoner] [--no-warm]
//     `--kb` (fake mode) adds a `## QUESTION BASE` prefix block + 3 per-question matches in the user turn (WP7) and a `kb` stage column.
//     FAKE (default, no key, no spend): local SSE server with injected, SYNTHETIC latency profiles. It proves the instrumentation,
//     pre-warm and prefix-cache plumbing; the millisecond values are the profile's, not any real model's.
//   OPENROUTER_API_KEY=... node scripts/copilot-latency.mjs --live --models a/b,c/d --runs 12 --max-usd 2
//     LIVE: real OpenRouter calls; prints the same stage table from measured timestamps. The app reads its key from safeStorage;
//     a CLI cannot, so this dev-only harness takes the key from the environment. Spend is capped by --max-usd (provider-billed
//     cost when reported, otherwise the dated price table). Never run in CI.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const dist = join(root, 'dist/electron')
const fx = join(root, 'electron/copilot/fixtures')

const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, all) => (a.startsWith('--') ? [[a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? 'true' : all[i + 1]]] : [])))
const live = args.live === 'true'
const key = process.env.OPENROUTER_API_KEY
if (live && !key) { console.error('--live needs OPENROUTER_API_KEY (dev harness only; the app itself uses safeStorage). Omit --live for the fake-server run.'); process.exit(2) }
const models = (args.models ?? 'google/gemini-2.5-flash-lite,openai/gpt-4.1-nano,anthropic/claude-haiku-4.5').split(',')
const runs = Number(args.runs ?? 12)
const maxUsd = Number(args['max-usd'] ?? 2)
const tier = args.tier ?? 'fast'

const { createOpenRouter, collectText } = require(join(dist, 'copilot/providers/openrouter.js'))
const { createAnswerEngine, createLlmClassifier } = require(join(dist, 'copilot/engine.js'))
const { buildGrounding } = require(join(dist, 'copilot/context.js'))
const { createCostMeter } = require(join(dist, 'copilot/cost.js'))
const { createTraceLog, summarizeTraces } = require(join(dist, 'copilot/trace.js'))
const { classifyByRules, createDetector } = require(join(dist, 'copilot/detector.js'))
const { REPORT } = require(join(dist, 'job-view/fixtures.js'))
const { parseReport } = require(join(dist, 'job-view/reportParse.js'))

const orConfig = () => ({ dataCollection: 'deny', zdr: false, sort: 'latency' })
const provider = live ? createOpenRouter({ baseUrl: args['base-url'], getKey: () => key, config: orConfig }) : null
const cv = readFileSync(join(fx, 'harness-cv.md'), 'utf8')
const questions = JSON.parse(readFileSync(join(fx, 'harness-questions.json'), 'utf8'))
const report = parseReport(REPORT)
const withKb = args.kb === 'true'
const KB_BLOCK = ['## QUESTION BASE (questions this interviewer may ask; never claims about the candidate)', 'Skills: Kubernetes (strong), Terraform (working)', ...Array.from({ length: 8 }, (_, i) => `- Q: Fixture interview question ${i} about platform reliability and trade-offs → state the goal first`)].join('\n')
const kbMatch = (_job, text) => Array.from({ length: 3 }, (_, i) => ({ id: `k${i}`, text: `Related to "${text.slice(0, 40)}": fixture question ${i}?`, outline: 'state the goal first', sourceId: null, source: null }))
const grounding = buildGrounding({ jobId: 'fixture', title: 'Senior Platform Engineer', company: 'Acme Corp', report, rawReport: REPORT, posting: null }, cv, withKb ? KB_BLOCK : '')

let spent = 0
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] }
// config.js needs Electron, so the slice of copilot.json the engine reads is spelled out here (defaults from plan §7).
const cfgFor = model => ({ engine: { tier, escalateForDesignCoding: false, models: { fast: model, balanced: model, deep: model }, factCheck: true }, coaching: { shape: 'cues+star', length: 2, tone: 'direct', persona: '', quoteResume: true }, privacy: { redact: true } })
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function benchModel(model) {
  const cost = createCostMeter()
  const ttft = [], total = [], costs = [], errors = []
  let lastSample = null
  const trace = createTraceLog()
  const engine = createAnswerEngine({ provider, config: () => cfgFor(model), grounding: () => grounding, cost, partialEveryMs: 1e9, trace, sessionId: () => 'harness' })
  await engine.warm?.()
  for (let i = 0; i <= runs; i++) { // run 0 is a warm-up (connection + prompt cache), reported separately
    if (spent >= maxUsd) { errors.push(`stopped: spend cap $${maxUsd} reached`); break }
    const q = questions[i % questions.length]
    try {
      let final = null
      for await (const s of engine.answer({ question: { id: `q${i}`, text: q.text, type: q.type, confidence: 1, at: 0, auto: false }, transcript: [], kind: 'answer', signal: new AbortController().signal })) if (s.done) final = s
      if (!final) throw new Error('no final suggestion')
      spent += final.costUsd ?? 0
      if (i > 0) { ttft.push(final.firstTokenMs); total.push(final.totalMs); costs.push(final.costUsd ?? 0) } else var warm = final.firstTokenMs
      lastSample = { say: final.say, bullets: final.bullets.length, flags: final.flags.length, proof: final.proof.length }
    } catch (e) { errors.push(String(e.code ?? '') + ' ' + String(e.message).slice(0, 120)) }
    await sleep(400)
  }
  return { model, stages: stageRow(trace.all().slice(1)), runs: ttft.length, ttftP50: pct(ttft, 0.5), ttftP95: pct(ttft, 0.95), ttftMin: ttft.length ? Math.min(...ttft) : null, totalP50: pct(total, 0.5), totalP95: pct(total, 0.95), costPerAnswerUsd: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null, unpriced: cost.unpriced(), errors, sample: lastSample }
}

async function benchDetector(model) {
  const classify = createLlmClassifier(provider, model, { timeoutMs: 8000 })
  const out = {}
  for (const name of ['detector-utterances', 'detector-heldout']) {
    const items = JSON.parse(readFileSync(join(fx, `${name}.json`), 'utf8')).items
    let tp = 0, fp = 0, fn = 0, calls = 0
    for (const it of items) {
      const d = createDetector({ classify: async t => { calls++; const c = await classify(t); return c } })
      const got = await d.feed({ id: 'x', speaker: 'interviewer', text: it.text, final: true, t0: 0, t1: 1 })
      if (got && it.label === 'q') tp++; else if (got) fp++; else if (it.label === 'q') fn++
    }
    out[name] = { precision: tp / (tp + fp), recall: tp / (tp + fn), classifyCalls: calls, n: items.length }
  }
  return out
}

const ms = v => (v == null ? '-' : `${Math.round(v)} ms`)
const st = x => (x ? `${ms(x.p50)} / ${ms(x.p95)}` : '-')
const stageRow = recs => { const sm = summarizeTraces(recs.map(r => r.ms)); const c = recs.map(r => r.ms.connect).filter(v => v != null); const kb = recs.map(r => r.ms.kb).filter(v => v != null); return { turns: sm.turns, kbP50: kb.length ? pct(kb, 0.5) : null, connectP50: pct(c, 0.5), ttft: sm.ttft, firstSay: sm.firstSay, endToSay: sm.endToSay, total: sm.total, cacheHitRate: sm.cacheHitRate } }
const stageTable = rows => ['| run | turns | connect p50 | first token p50/p95 | first visible line p50/p95 | speech end -> line p50 | done p50 | cache hit | kb p50 |', '|---|---|---|---|---|---|---|---|---|', ...rows.map(([name, r]) => `| ${name} | ${r.turns} | ${ms(r.connectP50)} | ${st(r.ttft)} | ${st(r.firstSay)} | ${ms(r.endToSay?.p50)} | ${ms(r.total?.p50)} | ${r.cacheHitRate == null ? '-' : `${Math.round(r.cacheHitRate * 100)}%`} | ${ms(r.kbP50)} |`)]

async function runFake() {
  const { startFakeServer, PROFILES } = await import('./copilot-fake-sse.mjs')
  const names = args.profile && args.profile !== 'all' ? [args.profile] : Object.keys(PROFILES)
  const warm = args['no-warm'] !== 'true'
  const rows = []
  for (const name of names) {
    const fake = await startFakeServer(PROFILES[name])
    const trace = createTraceLog()
    const p = createOpenRouter({ baseUrl: fake.baseUrl, getKey: () => 'fake-key', config: orConfig })
    const engine = createAnswerEngine({ provider: p, config: () => cfgFor(`fake/${name}`), grounding: () => grounding, trace, partialEveryMs: 1e9, sessionId: () => 'harness', ...(withKb ? { kbMatch } : {}) })
    if (warm) await engine.warm()
    for (let i = 0; i < runs; i++) {
      const q = questions[i % questions.length]
      const t = Date.now()
      // auto-ask turn: the interviewer stopped speaking 250 ms before the STT final, detector adds ~5 ms (simulated stage inputs)
      const marks = { speechEndAt: t - 255, sttFinalAt: t - 5, detectedAt: t }
      for await (const _ of engine.answer({ question: { id: `q${i}`, text: q.text, type: q.type, confidence: 1, at: 0, auto: true }, transcript: [], kind: 'answer', signal: new AbortController().signal, marks })) { /* drain */ }
    }
    rows.push([`fake/${name}${warm ? '' : ' (no warm-up)'}`, stageRow(trace.all())])
    console.error(`${name}: ${fake.stats.warmups} warm-up, ${fake.stats.chats} chats`)
    await fake.close()
  }
  console.log(`SYNTHETIC latency profiles (fake server): the table validates the instrumentation, not any real model.\ngrounding ~ ${grounding.tokens} tokens; ${runs} auto-ask turns per profile; warm-up ${warm ? 'on' : 'off'}\n`)
  console.log(stageTable(rows).join('\n'))
}

if (!live) { await runFake(); process.exit(0) }

console.error(`grounding ≈ ${grounding.tokens} tokens; models: ${models.join(', ')}; ${runs} runs each (+1 warm-up); cap $${maxUsd}`)
const results = []
for (const m of models) { console.error(`→ ${m}`); results.push(await benchModel(m)) }
const detector = args.detector ? await benchDetector(args.detector === 'true' ? models[0] : args.detector) : null
const report_ = { at: new Date().toISOString(), node: process.version, os: `${os.type()} ${os.release()} ${os.arch()}`, groundingTokens: grounding.tokens, tier, runsPerModel: runs, spendUsd: Number(spent.toFixed(5)), results, detector }
const outDir = join(root, 'docs/plans/interview-copilot/measurements')
mkdirSync(outDir, { recursive: true })
const file = join(outDir, `copilot-latency-${report_.at.replace(/[:.]/g, '-')}.json`)
writeFileSync(file, JSON.stringify(report_, null, 2) + '\n')
console.log('| model | n | TTFT p50 | TTFT p95 | total p50 | $/answer | errors |\n|---|---|---|---|---|---|---|')
for (const r of results) console.log(`| ${r.model} | ${r.runs} | ${r.ttftP50} ms | ${r.ttftP95} ms | ${r.totalP50} ms | ${r.costPerAnswerUsd?.toFixed(5)} | ${r.errors.length} |`)
console.log('\n' + stageTable(results.map(r => [r.model, r.stages])).join('\n'))
if (detector) console.log('\ndetector with LLM classify:', JSON.stringify(detector))
console.error(`spent $${spent.toFixed(4)}; wrote ${file}`)
