// Writer + funnel check against a COPY of career-ops with its real scripts (reserve-report-num, merge-tracker, reconcile-pipeline).
//   npx vite-node scripts/eval-writer-e2e.ts -- --root /path/to/career-ops-copy --limit 40
// Reads data/pipeline.md for real titles/locations; the JD text and the model are fakes. Never point it at live data.
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { parseCv } from '../electron/ats/model'
import { defaultPolicy, readProfile } from '../electron/prescreen-core'
import { fakeLlm } from '../electron/eval-pipeline/fakes'
import { runPipeline } from '../electron/eval-pipeline/run'
import { parseRange } from '../electron/eval-pipeline/stage4-write'

const root = process.argv[process.argv.indexOf('--root') + 1]!
const limit = Number(process.argv[process.argv.indexOf('--limit') + 1] || 40)
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8')
const node = (...a: string[]) => execFileSync('node', a, { cwd: root, env: { ...process.env, CAREER_OPS_ROOT: root }, encoding: 'utf8' })

const profile = readProfile(read('config/profile.yml'), read('modes/_profile.md'), read('cv.md'))
const cand = { profile, policy: defaultPolicy(profile), cv: parseCv(read('cv.md')), profileKey: 'e2e' }
const all = read('data/pipeline.md').split('\n').filter(l => l.startsWith('- [ ] ')).map(l => l.slice(6).split(' | ')).map(p => ({ id: p[0]!.trim(), url: p[0]!.trim(), company: p[1]?.trim() ?? '?', title: p[2]?.trim() ?? '?', location: p[3]?.replace(/posted:.*$/, '').trim() || null }))
console.log('queued jobs in pipeline.md:', all.length)

// 1) real-title funnel over the whole queue (stage 1 only needs title + location + JD text; JD = skills line so stage 1 deny/years rules stay neutral)
const jd = (j: { title: string; url: string; location: string | null }) => `${j.title} ref ${j.url.replace(/\W/g, '')}\n${j.location ?? ''}\nWe use Java, Spring Boot, Kafka, PostgreSQL, AWS and Docker. ${'Build great software with a friendly team. '.repeat(20)}`
const dir = fs.mkdtempSync('/tmp/cl-e2e-')
const funnel = await runPipeline(all, { runId: 'f', runDir: path.join(dir, 'f'), candidate: cand, fetchJd: async j => jd(j), llm: fakeLlm([]), write: null, config: { skipBelow: 0 }, cacheFile: path.join(dir, 'c.json') })
const by: Record<string, number> = {}
for (const r of funnel.results) by[r.fate === 'skip' ? `skip:${r.stage}:${r.reason.split(':')[0]}` : r.fate] = (by[r.fate === 'skip' ? `skip:${r.stage}:${r.reason.split(':')[0]}` : r.fate] ?? 0) + 1
console.log('title+location funnel over the real queue:', JSON.stringify(by))

// 2) writer vs the REAL scripts, on `limit` jobs that pass stage 1
const pass = funnel.results.filter(r => r.fate !== 'skip' && r.fate !== 'failed').map(r => all.find(j => j.id === r.jobId)!).slice(0, limit)
const llm = fakeLlm(pass.map(j => ({ ...j, kind: 'match' as const, jd: jd(j), truth: 3.9 })), { noise: 0.5 })
const before = read('data/applications.md').split('\n').filter(l => l.startsWith('|')).length
const out = await runPipeline(pass, {
  runId: 'e2e', runDir: path.join(dir, 'e2e'), candidate: cand, fetchJd: async j => jd(j), llm, cacheFile: path.join(dir, 'c2.json'), config: { skipBelow: 0, escalateMin: 99 },
  write: {
    root, date: '2026-10-07', runId: 'e2e',
    reserve: async n => parseRange(node('reserve-report-num.mjs', '--count', String(n)), n),
    release: async nums => { for (const n of nums) node('reserve-report-num.mjs', '--release', n) },
    finalize: async () => { console.log(node('merge-tracker.mjs').trim().split('\n').slice(-6).join('\n')); console.log(node('reconcile-pipeline.mjs').trim().split('\n').slice(-3).join('\n')) },
  },
})
const after = read('data/applications.md').split('\n').filter(l => l.startsWith('|')).length
console.log('written', out.results.filter(r => r.fate === 'light').length, 'tracker rows before/after', before, after)
console.log(read('data/applications.md').split('\n').filter(l => l.startsWith('|')).slice(-3).join('\n'))
console.log('verify:'); try { console.log(node('verify-pipeline.mjs').trim().split('\n').slice(-8).join('\n')) } catch (e) { console.log('verify failed', String(e).slice(0, 400)) }
