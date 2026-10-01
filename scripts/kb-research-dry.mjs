#!/usr/bin/env node
// Job knowledge base research dry run (plan §11 WP2, spike S-R1). Runs the real pipeline outside Electron and prints the yield table.
//   npm run build:electron && node scripts/kb-research-dry.mjs                     OFFLINE (default): synthetic web + scripted model, no key, no spend
//   CL_LIVE_RESEARCH=1 BRAVE_API_KEY=... OPENROUTER_API_KEY=... node scripts/kb-research-dry.mjs --live --jobs jobs.json [--depth standard] [--max-usd 1] [--model openai/gpt-4.1-nano] [--out /tmp/kb-dry]
//     LIVE: real search + real pages + a real model. jobs.json = [{ "title", "company", "techStack": [], "skills": [], "seniority", "gaps": [], "requirements": [] }]
//     (write it by hand or export from a CLONED profile; never point this at the real career-ops folder). Search keys come from the environment
//     (BRAVE_API_KEY, EXA_API_KEY, SERPER_API_KEY, or SEARXNG_URL for a local instance); a CLI cannot read the app's safeStorage. No CV is ever read.
//     Spend is capped by --max-usd across ALL jobs (default 1). Writes <out>/<n>.kb.json and prints the numbers for docs/plans/job-knowledge-base/spikes/S-R1.md.
// Never run in CI.
import { createRequire } from 'node:module'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import dns from 'node:dns/promises'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import os from 'node:os'

const require = createRequire(import.meta.url)
const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const d = join(root, 'dist/electron')
const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, all) => (a.startsWith('--') ? [[a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? 'true' : all[i + 1]]] : [])))
const live = args.live === 'true'
if (live && process.env.CL_LIVE_RESEARCH !== '1') { console.error('Live research spends real money: set CL_LIVE_RESEARCH=1 as well. Omit --live for the offline run.'); process.exit(2) }

const { runResearch } = require(join(d, 'kb/research/pipeline.js'))
const { createFetcher, realHttp } = require(join(d, 'kb/research/fetch.js'))
const { memoryResearchState } = require(join(d, 'kb/research/state.js'))
const { inputHashOf } = require(join(d, 'kb/research/plan.js'))
const { isPrivateHost } = require(join(d, 'integrations/firecrawl-client.js'))

const out = resolve(args.out ?? join(os.tmpdir(), 'kb-research-dry'))
mkdirSync(out, { recursive: true })
const depth = args.depth ?? 'standard'
const maxUsd = Number(args['max-usd'] ?? 1)
const emptyKb = () => ({ manifest: null, items: [], sources: [], skills: [], notes: { company: [], role: [], interviewerStyle: [], loop: [] } })

let jobs, backends, llm, net
const hostStats = new Map()
const tally = (url, ok, detail) => { const h = new URL(url).hostname; const s = hostStats.get(h) ?? { ok: 0, fail: 0, why: new Set() }; ok ? s.ok++ : (s.fail++, s.why.add(detail)); hostStats.set(h, s) }

if (!live) {
  const fx = require(join(d, 'kb/research/fixtures/web.js')), fl = require(join(d, 'kb/research/fixtures/llm.js')), fj = require(join(d, 'kb/research/fixtures/job.js')), fs_ = require(join(d, 'kb/research/search/fake.js'))
  const web = fx.createFakeWeb()
  jobs = [{ ...fj.JOB, cv: '' }]
  backends = [fs_.createFakeBackend({ results: () => fx.ALL_RESULTS })]
  const fake = fl.createFakeLlm({ usd: 0.002 })
  llm = (s, u, sig) => fake.call(s, u, sig)
  net = web.deps
} else {
  const { createBraveBackend } = require(join(d, 'kb/research/search/brave.js')), { createExaBackend } = require(join(d, 'kb/research/search/exa.js')), { createSerperBackend } = require(join(d, 'kb/research/search/serper.js')), { createSearxngBackend } = require(join(d, 'kb/research/search/searxng.js'))
  backends = [
    process.env.BRAVE_API_KEY && createBraveBackend({ key: process.env.BRAVE_API_KEY }), process.env.EXA_API_KEY && createExaBackend({ key: process.env.EXA_API_KEY }),
    process.env.SERPER_API_KEY && createSerperBackend({ key: process.env.SERPER_API_KEY }), process.env.SEARXNG_URL && createSearxngBackend({ baseUrl: process.env.SEARXNG_URL }),
  ].filter(Boolean)
  if (!backends.length) { console.error('Set BRAVE_API_KEY, EXA_API_KEY, SERPER_API_KEY or SEARXNG_URL.'); process.exit(2) }
  if (!process.env.OPENROUTER_API_KEY) { console.error('Set OPENROUTER_API_KEY (the extraction model).'); process.exit(2) }
  if (!args.jobs) { console.error('Pass --jobs jobs.json (see the header).'); process.exit(2) }
  jobs = JSON.parse(readFileSync(args.jobs, 'utf8')).map(j => ({ jobId: `dry:${j.company}:${j.title}`, requirements: [], skills: [], techStack: [], gaps: [], seniority: null, ...j, cv: '' }))
  const model = args.model ?? 'openai/gpt-4.1-nano'
  llm = async (system, user, signal) => {
    const r = await fetch('https://openrouter.ai/api/v1/chat/completions', { method: 'POST', signal, headers: { 'content-type': 'application/json', authorization: `Bearer ${process.env.OPENROUTER_API_KEY}` }, body: JSON.stringify({ model, messages: [{ role: 'system', content: system }, { role: 'user', content: user }], usage: { include: true } }) })
    if (!r.ok) throw new Error(`model call failed (${r.status})`)
    const j = await r.json()
    const u = j.usage ?? {}
    return { text: j.choices?.[0]?.message?.content ?? '', usd: typeof u.cost === 'number' ? u.cost : ((u.prompt_tokens ?? 0) * 0.1 + (u.completion_tokens ?? 0) * 0.4) / 1e6 }
  }
  net = {
    http: realHttp('Careerloom/dry-run'), now: Date.now, userAgent: 'Careerloom/dry-run',
    sleep: (ms, signal) => new Promise((res, rej) => { const t = setTimeout(res, ms); signal.addEventListener('abort', () => { clearTimeout(t); rej(signal.reason) }, { once: true }) }),
    resolve: async host => { const recs = await dns.lookup(host.replace(/^\[|\]$/g, ''), { all: true }); if (recs.some(r => isPrivateHost(r.address))) throw new Error(`${host} resolves to a private address — refused`) },
  }
}

let spent = 0
let lastPhase = ''
const rows = []
for (const [n, job] of jobs.entries()) {
  const left = +(maxUsd - spent).toFixed(4)
  if (left <= 0.01) { console.log(`cap reached, skipping ${jobs.length - n} job(s)`); break }
  const fetcher = createFetcher({ ...net, company: job.company })
  const store = { read: () => emptyKb(), commit: (_id, kb) => { writeFileSync(join(out, `${n + 1}.kb.json`), JSON.stringify(kb, null, 2)); return kb } }
  const t0 = Date.now()
  const res = await runResearch(job.jobId, { depth, budgetUsd: Math.min(left, 0.5), minutes: 8, allowAgent: false }, {
    runId: `dry-${n + 1}`, job, inputHash: inputHashOf({ jd: job.techStack, gaps: job.gaps, role: job.title, company: job.company }), backends, state: memoryResearchState(),
    fetch: async (url, signal) => { const o = await fetcher(url, signal); tally(url, o.ok, o.ok ? '' : `${o.reason}: ${o.detail}`); return o },
    llm, store, onProgress: p => { if (p.phase !== lastPhase) { lastPhase = p.phase; process.stderr.write(`[${n + 1}/${jobs.length}] ${p.phase} · $${p.spentUsd.toFixed(3)} · ${p.itemsFound} items\n`) } }, signal: new AbortController().signal,
  })
  spent += res.costUsd
  rows.push({ job: `${job.title} @ ${job.company}`, ...res, seconds: +((Date.now() - t0) / 1000).toFixed(1), sourcedPct: res.items ? Math.round((100 * res.sourced) / res.items) : 0 })
}
console.log(`\nmode: ${live ? 'LIVE' : 'offline fixtures (synthetic web, scripted model)'} · depth ${depth} · out ${out}\n`)
console.table(rows.map(r => ({ job: r.job, status: r.status, items: r.items, 'sourced %': r.sourcedPct, sourced: r.sourced, generated: r.generated, pages: r.pages, searches: r.searches, skipped: r.skipped, 'cost $': +r.costUsd.toFixed(3), 's': r.seconds })))
console.log('\nper-host fetch results (failures: reason)')
console.table([...hostStats].map(([host, s]) => ({ host, ok: s.ok, fail: s.fail, why: [...s.why].join(' | ').slice(0, 90) })))
console.log(`total spend $${spent.toFixed(3)} of cap $${maxUsd}`)
