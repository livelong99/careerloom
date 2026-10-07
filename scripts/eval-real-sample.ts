// Quality guard on REAL evaluations: re-run the deterministic stages (1-2) on the JDs archived in existing career-ops
// reports and compare with the full evaluator's score. Point it at a COPY of career-ops (read-only here).
//   npx vite-node scripts/eval-real-sample.ts -- --root /path/to/career-ops-copy
import fs from 'node:fs'
import path from 'node:path'

import { parseCv } from '../electron/ats/model'
import { parseReport } from '../electron/job-view/reportParse'
import { defaultPolicy, readProfile } from '../electron/prescreen-core'
import { jdHash } from '../electron/eval-pipeline/stage0-fetch'
import { stage1 } from '../electron/eval-pipeline/stage1-filter'
import { stage2 } from '../electron/eval-pipeline/stage2-score'
import type { FetchedJob } from '../electron/eval-pipeline/types'

const i = process.argv.indexOf('--root')
const root = i > 0 ? process.argv[i + 1]! : ''
const k = process.argv.indexOf('--skip-below')
const skipBelow = k > 0 ? Number(process.argv[k + 1]) : 35
if (!root) throw new Error('--root <career-ops copy> required')
const read = (f: string) => { try { return fs.readFileSync(path.join(root, f), 'utf8') } catch { return '' } }
const cvText = read('cv.md')
const profile = readProfile(read('config/profile.yml'), read('modes/_profile.md'), cvText)
const policy = defaultPolicy(profile)
const c = { profile, policy, cv: parseCv(cvText), profileKey: 'real' }

const rows = fs.readdirSync(path.join(root, 'reports')).filter(f => /^\d+-.*\.md$/.test(f) && !f.includes('RESERVED')).map(f => {
  const v = parseReport(fs.readFileSync(path.join(root, 'reports', f), 'utf8'))
  return { f, score: v.score, company: v.company ?? '?', role: v.role ?? '?', jd: v.jd ?? '' }
}).filter(r => r.score !== null && r.jd.length > 200)

const jobs: FetchedJob[] = rows.map(r => ({ id: r.f, url: r.f, title: r.role, company: r.company, location: null, jd: r.jd, jdHash: jdHash(r.jd, null) }))
const s1 = stage1(jobs, c)
const s2 = stage2(s1.pass, c, skipBelow)
const verdict = new Map<string, string>([...s1.settled, ...s2.settled].map(r => [r.jobId, `DROP(${r.stage}): ${r.reason}`]))
const local = new Map(s2.pass.map(j => [j.id, j.local.score]))
console.log(`Profile: ${profile.targets.length} targets, ${policy.years ?? '?'} years, countries ${policy.countries.join(', ') || '-'}; skipBelow ${skipBelow}\n`)
console.log('| report | full score | stages 1-2 |\n|---|---:|---|')
for (const r of rows) console.log(`| ${r.f.slice(0, 34)} | ${r.score} | ${verdict.get(r.f) ?? `pass, local ${local.get(r.f)}`} |`)
const dropped = rows.filter(r => verdict.has(r.f))
const falseSkips = dropped.filter(r => r.score! >= 3.5)
console.log(`\n${rows.length} real reports · ${dropped.length} dropped before any model call · ${falseSkips.length} of those scored >= 3.5 by the full evaluator`)
const pairs = rows.filter(r => local.has(r.f)).map(r => [local.get(r.f)!, r.score!])
if (pairs.length > 2) {
  const rank = (xs: number[]) => xs.map(x => xs.filter(y => y < x).length + (xs.filter(y => y === x).length - 1) / 2)
  const [a, b] = [rank(pairs.map(p => p[0]!)), rank(pairs.map(p => p[1]!))]
  const mean = (xs: number[]) => xs.reduce((s, x) => s + x, 0) / xs.length
  const [ma, mb] = [mean(a), mean(b)]
  const num = a.reduce((s, x, k) => s + (x - ma) * (b[k]! - mb), 0)
  const den = Math.sqrt(a.reduce((s, x) => s + (x - ma) ** 2, 0) * b.reduce((s, x) => s + (x - mb) ** 2, 0))
  console.log(`Spearman(local score, full score) over ${pairs.length} reports: ${den ? (num / den).toFixed(2) : 'n/a'}`)
}
