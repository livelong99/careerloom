#!/usr/bin/env node
// Interview Copilot latency harness (plan §12): first-token p50/p95 through the real engine + OpenRouter provider.
//   npm run build:electron && OPENROUTER_API_KEY=... node scripts/copilot-latency.mjs --models a/b,c/d,e/f --runs 12 --max-usd 2
// The app reads its key from safeStorage; a CLI cannot, so this dev-only harness takes the key from the environment.
// Spend is capped by --max-usd (provider-billed cost when reported, otherwise the dated price table). Never run in CI.
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
const key = process.env.OPENROUTER_API_KEY
if (!key) { console.error('Set OPENROUTER_API_KEY (dev harness only; the app itself uses safeStorage).'); process.exit(2) }
const models = (args.models ?? 'google/gemini-2.5-flash-lite,openai/gpt-4.1-nano,anthropic/claude-haiku-4.5').split(',')
const runs = Number(args.runs ?? 12)
const maxUsd = Number(args['max-usd'] ?? 2)
const tier = args.tier ?? 'fast'

const { createOpenRouter, collectText } = require(join(dist, 'copilot/providers/openrouter.js'))
const { createAnswerEngine, createLlmClassifier } = require(join(dist, 'copilot/engine.js'))
const { buildGrounding } = require(join(dist, 'copilot/context.js'))
const { createCostMeter } = require(join(dist, 'copilot/cost.js'))
const { classifyByRules, createDetector } = require(join(dist, 'copilot/detector.js'))
const { REPORT } = require(join(dist, 'job-view/fixtures.js'))
const { parseReport } = require(join(dist, 'job-view/reportParse.js'))

const provider = createOpenRouter({ baseUrl: args['base-url'], getKey: () => key, config: () => ({ dataCollection: 'deny', zdr: false, sort: 'latency' }) })
const cv = readFileSync(join(fx, 'harness-cv.md'), 'utf8')
const questions = JSON.parse(readFileSync(join(fx, 'harness-questions.json'), 'utf8'))
const report = parseReport(REPORT)
const grounding = buildGrounding({ jobId: 'fixture', title: 'Senior Platform Engineer', company: 'Acme Corp', report, rawReport: REPORT, posting: null }, cv)

let spent = 0
const pct = (xs, p) => { if (!xs.length) return null; const s = [...xs].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.ceil(p * s.length) - 1)] }
// config.js needs Electron, so the slice of copilot.json the engine reads is spelled out here (defaults from plan §7).
const cfgFor = model => ({ engine: { tier, escalateForDesignCoding: false, models: { fast: model, balanced: model, deep: model }, factCheck: true }, coaching: { shape: 'cues+star', length: 2, tone: 'direct', persona: '', quoteResume: true }, privacy: { redact: true } })
const sleep = ms => new Promise(r => setTimeout(r, ms))

async function benchModel(model) {
  const cost = createCostMeter()
  const ttft = [], total = [], costs = [], errors = []
  let lastSample = null
  const engine = createAnswerEngine({ provider, config: () => cfgFor(model), grounding: () => grounding, cost, partialEveryMs: 1e9 })
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
  return { model, runs: ttft.length, ttftP50: pct(ttft, 0.5), ttftP95: pct(ttft, 0.95), ttftMin: ttft.length ? Math.min(...ttft) : null, totalP50: pct(total, 0.5), totalP95: pct(total, 0.95), costPerAnswerUsd: costs.length ? costs.reduce((a, b) => a + b, 0) / costs.length : null, unpriced: cost.unpriced(), errors, sample: lastSample }
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
if (detector) console.log('\ndetector with LLM classify:', JSON.stringify(detector))
console.error(`spent $${spent.toFixed(4)}; wrote ${file}`)
