#!/usr/bin/env node
// Builds a fictional, fully populated demo workspace for README screenshots.
//   node scripts/demo-seed/seed.mjs [--root /private/tmp/career-ops-demo] [--profile /private/tmp/careerloom-demo-profile] [--now 2026-10-10T18:00:00Z]
// Needs `npm run build:electron` first (it reuses the app's own pure modules from dist/electron so the seeded
// files are in exactly the format the app reads). Only ever writes inside --root and --profile; refuses anything
// else. Every name, company, URL and key is fictional; nothing is fetched and no model is called.
// Launch afterwards: see scripts/demo-seed/README.md.
import { execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { CANDIDATE, COMPANIES, CV_MD, ENABLED_BOARDS, JOBS, PROFILE_YML } from './data.mjs'
import { makeReport, reportFile } from './reports.mjs'
import { seedUserData } from './userdata.mjs'

const require = createRequire(import.meta.url)
const here = path.dirname(fileURLToPath(import.meta.url))
const repo = path.resolve(here, '..', '..')
const dist = p => require(path.join(repo, 'dist', 'electron', p))
const arg = (name, fallback) => { const i = process.argv.indexOf(`--${name}`); return i > 0 ? process.argv[i + 1] : fallback }

const ROOT = path.resolve(arg('root', '/private/tmp/career-ops-demo'))
const PROFILE = path.resolve(arg('profile', '/private/tmp/careerloom-demo-profile'))
for (const dir of [ROOT, PROFILE]) {
  if (!dir.startsWith('/private/tmp/') && !dir.startsWith(os_tmp())) throw new Error(`Refusing to seed outside a temp folder: ${dir}`)
}
function os_tmp() { return fs.realpathSync(process.env.TMPDIR || '/tmp') }

const NOW = arg('now') ? Date.parse(arg('now')) : Math.floor(Date.now() / 60_000) * 60_000 // the demo "today": everything is dated relative to it
const DAY = 86_400_000
const iso = ms => new Date(ms).toISOString().slice(0, 10)
const write = (file, text) => { fs.mkdirSync(path.dirname(file), { recursive: true }); fs.writeFileSync(file, text) }
const norm = u => u.replace(/\/+$/, '')

// ————— 1. career-ops checkout —————
if (!fs.existsSync(path.join(ROOT, 'AGENTS.md'))) {
  execFileSync('git', ['clone', '--depth', '1', 'https://github.com/career-ops-hq/career-ops', ROOT], { stdio: 'inherit' })
}
if (!fs.existsSync(path.join(ROOT, 'node_modules'))) execFileSync('npm', ['install', '--ignore-scripts', '--no-audit', '--no-fund', '--omit=dev'], { cwd: ROOT, stdio: 'inherit' })
fs.rmSync(path.join(ROOT, 'reports'), { recursive: true, force: true })
for (const f of ['pipeline.md', 'applications.md', 'scan-history.tsv', 'scan-runs.tsv', 'portal-health.tsv', 'careerloom-prescreen.json', 'careerloom-web-boards.json', 'careerloom-defaults-seeded.json']) {
  fs.rmSync(path.join(ROOT, 'data', f), { force: true })
}

// ————— 2. jobs —————
const jobUrl = (co, i) => `https://${co.host}/${co.slug}/jobs/${co.ats === 'lever' || co.ats === 'ashby' ? `${(4000 + i * 37).toString(16)}-${(9100 + i * 11).toString(16)}` : 4000 + i * 17}`
const jobs = JOBS.map(([c, title, location, status, score, family], i) => {
  const co = COMPANIES[c]
  return { i, co, company: co.name, title, location, status, score, family, url: jobUrl(co, i), seen: iso(NOW - (3 + ((i * 7) % 24)) * DAY) }
})
// Postings found by the enabled starter-pack boards (many companies per board; filed under the board that found them).
const WEB = [
  ['Naukri', 'Marigold Labs', 'Senior Backend Engineer', 'Bengaluru, India'], ['Naukri', 'Bluepeak Data', 'Senior Data Engineer', 'Hyderabad, India'], ['Naukri', 'Ridgeline Freight', 'Java Developer', 'Pune, India'],
  ['LinkedIn Jobs', 'Copperleaf Finance', 'Senior Platform Engineer', 'Bengaluru, India'], ['LinkedIn Jobs', 'Sunbeam Retail', 'Backend Engineer, Orders', 'Remote (India)'], ['LinkedIn Jobs', 'Marigold Labs', 'Engineering Manager', 'Bengaluru, India'],
  ['Instahyre', 'Bluepeak Data', 'Staff Software Engineer', 'Bengaluru, India'], ['Instahyre', 'Copperleaf Finance', 'Senior Backend Engineer, Treasury', 'Bengaluru, India'],
  ['Wellfound India', 'Sunbeam Retail', 'Founding Backend Engineer', 'Remote (India)'], ['Wellfound India', 'Ridgeline Freight', 'Site Reliability Engineer', 'Pune, India'],
  ['hirist.tech', 'Marigold Labs', 'Golang Developer', 'Bengaluru, India'], ['Cutshort', 'Copperleaf Finance', 'Backend Engineer', 'Remote (India)'],
].map(([board, company, title, location], k) => ({ board, company, title, location, status: '', score: null, family: 'be', url: `https://www.${board.toLowerCase().replace(/[^a-z]+/g, '')}.example/job-listings/${company.toLowerCase().replace(/\s+/g, '-')}-${k + 100}`, seen: iso(NOW - (1 + (k % 6)) * DAY) }))

const evaluated = jobs.filter(j => j.score !== null)
  .sort((a, b) => a.i - b.i)
  .map((j, k) => ({ ...j, n: k + 1, date: iso(NOW - 26 * DAY + Math.round((k * 24) / Math.max(1, 26)) * DAY) }))
const byUrl = new Map(evaluated.map(j => [j.url, j]))

// ————— 3. data files —————
write(path.join(ROOT, 'cv.md'), CV_MD)
fs.utimesSync(path.join(ROOT, 'cv.md'), new Date(NOW - 31 * DAY), new Date(NOW - 31 * DAY))
write(path.join(ROOT, 'config', 'profile.yml'), PROFILE_YML)
write(path.join(ROOT, 'modes', '_profile.md'), `# User profile\n\n${CANDIDATE.name} — ${CANDIDATE.headline}. Looking for senior backend and platform roles in India (Bengaluru hybrid or remote).\n`)

for (const j of evaluated) {
  const file = path.join(ROOT, 'reports', reportFile(j.n, j.company, j.date))
  write(file, makeReport({ n: j.n, company: j.company, domain: j.co.domain, title: j.title, url: j.url, date: j.date, score: j.score, family: j.family, location: j.location, ats: j.co.ats }))
  const t = new Date(`${j.date}T11:00:00Z`)
  fs.utimesSync(file, t, t)
  j.report = `reports/${reportFile(j.n, j.company, j.date)}`
}

const pad = n => String(n).padStart(3, '0')
const rows = evaluated.map(j => `| ${j.n} | ${j.date} | ${j.company} | ${j.title} | ${j.score.toFixed(1)}/5 | ${j.status} | ${j.score >= 3.5 ? '✅' : '❌'} | [${pad(j.n)}](../${j.report}) | ${j.status === 'Offer' ? 'Verbal offer 3 days ago, reply due in 7 days' : j.status === 'Interview' ? 'Round 2 scheduled' : j.status === 'Rejected' ? 'Declined after screen' : ''} |`)
write(path.join(ROOT, 'data', 'applications.md'), `# Applications Tracker\n\n| # | Date | Company | Role | Score | Status | PDF | Report | Notes |\n|---|------|---------|------|-------|--------|-----|--------|-------|\n${rows.join('\n')}\n`)

const all = [...jobs, ...WEB]
const pending = all.filter(j => j.score === null && (j.status === 'Q' || j.board))
write(path.join(ROOT, 'data', 'pipeline.md'), `# Pipeline\n\n## Pending\n\n${pending.map(j => `- [ ] ${j.url} | ${j.company} | ${j.title}`).join('\n')}\n\n## Processed\n\n${evaluated.map(j => `- [x] #${pad(j.n)} | ${j.url} | ${j.company} | ${j.title} | ${j.score.toFixed(1)}/5 | ${j.score >= 3.5 ? 'PDF ✅' : 'PDF ❌'}`).join('\n')}\n`)

const sourceOf = j => j.co?.ats ? `${j.co.ats}-api` : 'web-board'
write(path.join(ROOT, 'data', 'scan-history.tsv'), 'url\tfirst_seen\tportal\ttitle\tcompany\tstatus\tlocation\tfingerprint\tposted_at\ttrust_score\ttrust_flags\n'
  + all.map(j => [j.url, j.seen, sourceOf(j), j.title, j.company, 'added', j.location, '', iso(Date.parse(j.seen) - 2 * DAY), 82 + (j.i ?? 3) % 15, ''].join('\t')).join('\n') + '\n')

// Scan runs: career-ops' own tsv plus matching Careerloom run records (userdata.mjs) so Boards > Scans has both.
const SCANS = [[2, 14, 'Scan all portals', 9, 41, 12, null, 18.2], [4, 14, 'Scan all portals', 9, 38, 5, null, 9.4], [7, 4, 'Scan 4 portals', 4, 17, 4, 'Naukri, LinkedIn Jobs, Instahyre, Wellfound India', 15.7], [10, 14, 'Scan all portals', 9, 36, 3, null, 11.1], [15, 3, 'Scan 3 portals', 3, 24, 6, 'Northwind, Helios Labs, Quillstack', 14.3], [21, 14, 'Scan all portals', 9, 40, 9, null, 19.6]]
const scans = SCANS.map(([ago, boards, label, companies, found, added, input, hour], k) => ({ startedAt: NOW - ago * DAY - Math.round((new Date(NOW).getHours() + new Date(NOW).getMinutes() / 60 - hour) * 3600_000), ms: 2 * 60_000 + k * 17_000, label, input, companies, boards, found, added, filtered: [Math.round(found * 0.15), Math.round(found * 0.12), Math.round(found * 0.05)] }))
write(path.join(ROOT, 'data', 'scan-runs.tsv'), `timestamp\tstatus\tcompanies\tboards\tfound\tfiltered_title\tfiltered_tier\tfiltered_location\tfiltered_posting_age\tfiltered_salary\tfiltered_content\tfiltered_cooldown\tdupes\tnew_added\terrors\n`
  + scans.map(s => [new Date(s.startedAt + s.ms).toISOString(), 'completed', s.companies, 3, s.found, s.filtered[0], 0, s.filtered[1], s.filtered[2], 0, 0, 0, Math.max(0, s.found - s.added - s.filtered.reduce((a, b) => a + b, 0)), s.added, 0].join('\t')).join('\n') + '\n')
write(path.join(ROOT, 'data', 'portal-health.tsv'), 'timestamp\tcompany\tstatus\n' + COMPANIES.map((c, k) => `${new Date(NOW - 3 * 3600_000).toISOString()}\t${c.name}\t${k === 8 ? 'empty' : 'ok'}`).join('\n') + '\n')

// ————— 4. portals.yml: fictional company boards + the app's India starter pack (a few switched on) —————
const { presetBoards, searchProfile } = dist('integrations/portal-defaults.js')
const { stringify } = require('yaml')
const starter = presetBoards(searchProfile(PROFILE_YML)).map(b => (ENABLED_BOARDS.includes(b.name) ? { ...b, enabled: true } : b))
const tracked = COMPANIES.map(c => ({ name: c.name, careers_url: `https://${c.host}/${c.slug}`, provider: c.ats, enabled: true }))
write(path.join(ROOT, 'portals.yml'), stringify({ tracked_companies: [...tracked, ...starter] }))
write(path.join(ROOT, 'data', 'careerloom-defaults-seeded.json'), JSON.stringify({ at: new Date(NOW - 20 * DAY).toISOString(), added: starter.length }))
write(path.join(ROOT, 'data', 'careerloom-web-boards.json'), JSON.stringify(Object.fromEntries(WEB.map(j => [norm(j.url), j.board]))))

// ————— 5. pre-screen verdicts for everything not yet evaluated (the app's own rule gates; no model) —————
const core = dist('prescreen-core.js')
const profile = core.readProfile(PROFILE_YML, fs.readFileSync(path.join(ROOT, 'modes', '_profile.md'), 'utf8'), CV_MD)
const policy = core.defaultPolicy(profile)
const hash = core.profileHash(profile, policy)
const results = Object.fromEntries(all.filter(j => j.score === null).map(j => {
  const signals = core.keywordSignals(j.title, profile)
  return [norm(j.url), { ...core.screen(j, signals, profile, policy, null), fit: null, signals, at: new Date(NOW - DAY).toISOString(), profileHash: hash, method: 'rules' }]
}))
core.writeStore(ROOT, { results, policy })

// ————— 6. app profile (settings, runs, chats, knowledge base, copilot, ATS, keys metadata) —————
await seedUserData({ repo, dist, root: ROOT, profile: PROFILE, now: NOW, jobs: all, evaluated, scans, candidate: CANDIDATE, cv: CV_MD, write })

const counts = { jobs: all.length, evaluated: evaluated.length, queued: pending.length, unlikely: Object.values(results).filter(r => r.bucket === 'unlikely').length }
console.log(`Seeded ${ROOT} and ${PROFILE}`, counts)
