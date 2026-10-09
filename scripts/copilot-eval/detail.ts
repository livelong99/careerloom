// More detail on a live model: the short answer, then More detail built on it, through the real engine and guard.
// Bundled and run by run.mjs --detail. Synthetic résumé only (fixtures/harness-cv.md).
import fs from 'node:fs'
import { DEFAULT_CONFIG } from '../../electron/copilot/config'
import { buildGrounding } from '../../electron/copilot/context'
import { heuristicHint } from '../../electron/copilot/detector'
import { createAnswerEngine } from '../../electron/copilot/engine'
import { createOpenRouter } from '../../electron/copilot/providers/openrouter'
import { routeQuestion } from '../../electron/copilot/routing'
import type { DetectedQuestion, Suggestion } from '../../electron/copilot/types'

const args = Object.fromEntries(process.argv.slice(2).flatMap((a, i, all) => (a.startsWith('--') ? [[a.slice(2), all[i + 1]?.startsWith('--') || all[i + 1] === undefined ? 'true' : all[i + 1]]] : [])))
const root = new URL(`file://${process.env.EVAL_ROOT}/`)
const cv = fs.readFileSync(new URL('electron/copilot/fixtures/harness-cv.md', root), 'utf8')
const key = process.env.OPENROUTER_API_KEY
if (!key) { console.error('needs OPENROUTER_API_KEY'); process.exit(2) }
const models = (args.models ?? '').split(',').filter(Boolean)
if (models.some(m => m.endsWith(':free')) && args['allow-free'] !== 'true') { console.error('pass --allow-free for :free models (synthetic résumé only)'); process.exit(2) }
const QS: Array<Pick<DetectedQuestion, 'text' | 'type'>> = [
  { text: 'Tell me about a time you led a migration.', type: 'behavioural' },
  { text: 'How does a database index speed up reads, and what does it cost you?', type: 'technical' },
  { text: 'How would you design a rate limiter for a public API?', type: 'system-design' },
]
const words = (t: string) => t.replace(/```[\s\S]*?```/g, ' ').split(/\s+/).filter(Boolean).length
const first = (t: string) => (t.split(/(?<=[.!?])\s/)[0] ?? '').toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
const out: unknown[] = []
for (const model of models) {
  const cfg = structuredClone(DEFAULT_CONFIG)
  cfg.engine.models = { fast: model, balanced: model, deep: model }
  cfg.engine.factCheck = true
  cfg.engine.openrouter = { ...cfg.engine.openrouter, dataCollection: args['allow-free'] === 'true' ? 'allow' : 'deny' }
  const engine = createAnswerEngine({ provider: createOpenRouter({ getKey: () => key, config: () => cfg.engine.openrouter }), config: () => cfg, partialEveryMs: 0,
    grounding: () => buildGrounding({ jobId: 'eval', title: 'Platform Engineer', company: 'Acme', report: null, rawReport: null, posting: null }, cv) })
  for (const [i, qq] of QS.entries()) {
    const q: DetectedQuestion = { id: `q${i}`, ...qq, confidence: 1, at: 0, auto: false, hint: heuristicHint(qq.text) }
    const run = async (kind: 'answer' | 'detail', prior?: { say: string; bullets: string[] }) => {
      let s: Suggestion | null = null, err: string | null = null; const t0 = performance.now()
      try { for await (const x of engine.answer({ question: q, transcript: [], kind, signal: new AbortController().signal, route: routeQuestion(q, cfg.engine, kind), ...(prior ? { prior } : {}) })) s = x } catch (e) { err = e instanceof Error ? e.message : String(e) }
      return { s, err, ms: Math.round(performance.now() - t0) }
    }
    const a = await run('answer')
    const d = a.s ? await run('detail', { say: a.s.say, bullets: a.s.bullets }) : { s: null, err: 'no answer', ms: 0 }
    const row = { model, q: qq.text, type: qq.type, answer: a.s && { say: a.s.say, bullets: a.s.bullets, words: words(a.s.say) }, detail: d.s && { say: d.s.say, bullets: d.s.bullets, star: d.s.star, flags: d.s.flags, kind: d.s.kind, words: words(d.s.say), sameHeadline: first(d.s.say).slice(0, 40) === first(a.s?.say ?? '').slice(0, 40) }, ms: { answer: a.ms, detail: d.ms }, errors: [a.err, d.err].filter(Boolean), cost: (a.s?.costUsd ?? 0) + (d.s?.costUsd ?? 0) }
    out.push(row)
    console.log(`${model} · ${qq.type}: answer ${row.answer?.words ?? '-'} w / detail ${row.detail?.words ?? '-'} w, ${row.detail?.bullets.length ?? 0} background lines, flags ${row.detail?.flags.length ?? '-'}, ${d.ms} ms${row.errors.length ? ` · ${row.errors.join(' | ')}` : ''}`)
  }
}
if (args.out) fs.writeFileSync(args.out, JSON.stringify(out, null, 2))
