// Offline answer-quality + latency harness for the Copilot prompt. Bundled and run by run.mjs; see that file for usage.
import fs from 'node:fs'
import { DEFAULT_CONFIG } from '../../electron/copilot/config'
import { createOpenRouter } from '../../electron/copilot/providers/openrouter'
import { fakeProvider, type FakeMode } from './fake'
import { CHECKS, scoreAnswer, type EvalQuestion, type Score } from './score'
import { runTurn, type Turn } from './turn'

const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, all) => (a.startsWith('--') ? [[a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? 'true' : all[i + 1]]] : [])))
const root = new URL(`file://${process.env.EVAL_ROOT}/`) // set by run.mjs: the bundle itself runs from a temp dir
const questions = (JSON.parse(fs.readFileSync(new URL('scripts/copilot-eval/questions.json', root), 'utf8')) as EvalQuestion[]).filter(q => !args.only || q.id.startsWith(args.only!)).slice(0, Number(args.limit ?? 1e9))
const cv = fs.readFileSync(new URL('electron/copilot/fixtures/harness-cv.md', root), 'utf8')
const live = args.provider === 'openrouter'
const key = process.env.OPENROUTER_API_KEY
if (live && !key) { console.error('--provider openrouter needs OPENROUTER_API_KEY (dev harness; the app keeps its key in safeStorage). Never printed or stored.'); process.exit(2) }
const models = (args.models ?? (live ? '' : 'fake')).split(',').filter(Boolean)
if (!models.length) { console.error('--models a/b,c/d is required with --provider openrouter'); process.exit(2) }
const free = models.find(m => /:free$/.test(m))
const allowFree = args['allow-free'] === 'true' // the fixture résumé is synthetic, so a free endpoint training on it costs nothing
if (live && free && !allowFree) { console.error(`Refusing free model ${free}: free endpoints may train on prompts (pass --allow-free to run the synthetic fixture on them).`); process.exit(2) }
const maxUsd = Number(args['max-usd'] ?? 0.3)
const pct = (xs: number[], p: number): number | null => (xs.length ? [...xs].sort((a, b) => a - b)[Math.min(xs.length - 1, Math.ceil(p * xs.length) - 1)]! : null)
const r0 = (n: number | null): number | null => (n === null ? null : Math.round(n))

const cfg = structuredClone(DEFAULT_CONFIG)
if (args.shape) cfg.coaching.shape = args.shape as typeof cfg.coaching.shape
if (args.length) cfg.coaching.length = Number(args.length) as 1 | 2 | 3
const tier = (args.tier ?? cfg.engine.tier) as typeof cfg.engine.tier
cfg.engine.tier = tier
cfg.engine.factCheck = true
cfg.engine.openrouter = { ...cfg.engine.openrouter, dataCollection: allowFree ? 'allow' : 'deny', sort: 'latency' }

let spent = 0
const report: Record<string, unknown> = { at: new Date().toISOString(), provider: live ? 'openrouter' : 'fake', tier, coaching: cfg.coaching, questions: questions.length, models: {} }
for (const model of models) {
  const mcfg = structuredClone(cfg)
  mcfg.engine.models = { fast: model, balanced: model, deep: model }
  const rows: Array<{ q: EvalQuestion; t: Turn; s: Score }> = []
  for (const q of questions) {
    if (spent >= maxUsd) { console.error(`cost cap $${maxUsd} reached after ${rows.length} questions`); break }
    const provider = live ? createOpenRouter({ getKey: () => key!, config: () => mcfg.engine.openrouter }) : fakeProvider(q, (args.mode ?? 'good') as FakeMode)
    const t = await runTurn(q, provider, mcfg, cv)
    spent += t.costUsd
    rows.push({ q, t, s: scoreAnswer(q, t, { cv, coaching: mcfg.coaching }) })
  }
  const ttft = rows.flatMap(r => (r.t.firstTokenMs === null ? [] : [r.t.firstTokenMs]))
  const total = rows.flatMap(r => (r.t.totalMs === null ? [] : [r.t.totalMs]))
  const byCheck = Object.fromEntries(CHECKS.map(c => [c, rows.filter(r => r.s.checks[c]).length]))
  const passN = rows.filter(r => r.s.pass).length
  ;(report.models as Record<string, unknown>)[model] = {
    n: rows.length, passRate: rows.length ? Math.round((1000 * passN) / rows.length) / 10 : null, failedBy: byCheck,
    ttftMs: { p50: r0(pct(ttft, 0.5)), p95: r0(pct(ttft, 0.95)) }, totalMs: { p50: r0(pct(total, 0.5)), p95: r0(pct(total, 0.95)) },
    costUsd: Math.round(rows.reduce((n, r) => n + r.t.costUsd, 0) * 1e5) / 1e5, failovers: rows.filter(r => r.t.model && r.t.model !== model && live).length,
    failures: rows.filter(r => !r.s.pass).map(r => ({ id: r.q.id, why: CHECKS.filter(c => r.s.checks[c]).map(c => `${c}: ${r.s.checks[c]}`), answer: (r.t.suggestion?.say ?? r.t.raw).slice(0, 160) })),
  }
  const m = (report.models as Record<string, { n: number; passRate: number; failedBy: object; ttftMs: object; totalMs: object; costUsd: number }>)[model]!
  console.log(`${model.padEnd(36)} pass ${m.passRate}% (${passN}/${m.n})  fail-by ${JSON.stringify(m.failedBy)}  ttft ${JSON.stringify(m.ttftMs)}  total ${JSON.stringify(m.totalMs)}  $${m.costUsd}`)
}
if (args.out) fs.writeFileSync(args.out, `${JSON.stringify(report, null, 1)}\n`)
else if (args.verbose) console.log(JSON.stringify(report, null, 1))
