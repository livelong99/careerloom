#!/usr/bin/env node
// Copilot answer-quality + latency harness. Deterministic checks (format, length, spoken register, personal-claim guard, domain rubric,
// reasoning leak, behaviour on gap/ambiguous/illegal/false-premise questions) over scripts/copilot-eval/questions.json, through the real
// buildPrompt -> engine -> parser -> guard path.
//   node scripts/copilot-eval/run.mjs                                   fake provider (checks the harness, NOT the prompt)
//   node scripts/copilot-eval/run.mjs --mode leak                       a defective fake: the matching check must fail
//   OPENROUTER_API_KEY=... node scripts/copilot-eval/run.mjs --provider openrouter --models openai/gpt-4.1-nano,anthropic/claude-haiku-4.5 --max-usd 0.3
// Flags: --only <id prefix>  --limit N  --tier fast|balanced|deep  --shape cues|cues+star|script  --length 1|2|3  --out file.json  --verbose
// Live runs refuse ':free' models, send data_collection=deny, run one request at a time and stop at --max-usd (default 0.30).
import { build } from 'esbuild'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'

const dir = path.dirname(fileURLToPath(import.meta.url))
const out = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'copilot-eval-')), 'run.mjs')
// config.ts reaches electron through userFile(); the harness only reads DEFAULT_CONFIG, so electron is an empty module here.
const stubElectron = { name: 'stub-electron', setup: b => { b.onResolve({ filter: /^electron$/ }, () => ({ path: 'electron', namespace: 'stub' })); b.onLoad({ filter: /.*/, namespace: 'stub' }, () => ({ contents: 'module.exports = {}', loader: 'js' })) } }
await build({ plugins: [stubElectron], entryPoints: [path.join(dir, 'run.ts')], bundle: true, platform: 'node', format: 'esm', outfile: out, logLevel: 'error', banner: { js: "import { createRequire as __cr } from 'node:module'; const require = __cr(import.meta.url);" } })
process.env.EVAL_ROOT = path.resolve(dir, '../..')
try { await import(pathToFileURL(out).href) } finally { fs.rmSync(path.dirname(out), { recursive: true, force: true }) }
