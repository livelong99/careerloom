// The app-profile half of the demo seed (the --profile folder = Electron's userData): settings, run history,
// agent chats, knowledge base, ATS reports, Copilot sessions, model-list caches. No secrets are written here;
// the three fake API keys go through the app's own key store (see capture/keys.mjs).
import fs from 'node:fs'
import path from 'node:path'

import { seedAts } from './ats.mjs'
import { seedChats } from './chats.mjs'
import { seedCopilot } from './copilot.mjs'
import { seedKb } from './kb.mjs'
import { MODEL_LIST } from './models.mjs'

const DAY = 86_400_000
let counter = 0
const uuid = () => { counter++; const h = counter.toString(16).padStart(12, '0'); return `d3adc0de-0000-4000-8000-${h}` }
const rnd = seed => () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }

export async function seedUserData(ctx) {
  const { dist, root, profile, now, jobs, evaluated, scans, write } = ctx
  const file = (...p) => path.join(profile, ...p)
  const json = (f, v) => write(file(f), JSON.stringify(v, null, 2))
  const rand = rnd(42)
  for (const d of ['threads', 'kb', 'ats', 'copilot', 'run-logs', 'runs.jsonl', 'skills']) fs.rmSync(file(d), { recursive: true, force: true })

  // settings.json: points at the demo folder, no update checks, helper model assignment, last key-test results.
  json('settings.json', {
    root, runner: 'claude', models: { claude: 'claude-sonnet-4-5', codex: 'gpt-5.1-codex', antigravity: 'gemini-3-pro', opencode: 'opencode/grok-code' },
    helperModels: { claude: 'claude-haiku-4-5' },
    prefs: { updates: { enabled: false }, retention: { runLogDays: null }, docs: { tone: 'warm', length: 'standard', humanize: true }, debug: { dir: null }, evalPipeline: { enabled: true } },
    keyMeta: {
      openrouter: { ok: true, latencyMs: 412, detail: 'Key accepted', at: now - 2 * DAY },
      groq: { ok: true, latencyMs: 188, detail: 'Key accepted', at: now - 2 * DAY },
      openai: { ok: true, latencyMs: 356, detail: 'Key accepted', at: now - 3 * DAY },
    },
    llm: { helper: { provider: 'openrouter', model: 'google/gemini-2.5-flash' }, customBaseUrl: null },
  })
  const steps = ['node', 'python', 'git', 'career-ops', 'opencode', 'prescreen-model', 'stt']
  json('bootstrap.json', Object.fromEntries(steps.map(s => [s, { state: ['prescreen-model', 'stt'].includes(s) ? 'skipped' : 'done', detail: null, error: null }])))
  // Extensions: three user-added skills (local folders with a SKILL.md, no git remote behind them).
  const SKILLS = [['demo-org__resume-polish', 'resume-polish', 'Tightens bullets and flags passive voice in a cv.md'], ['demo-org__offer-compare', 'offer-compare', 'Side-by-side comparison of compensation and growth across offers']]
  for (const [id, name, description] of SKILLS) write(file('skills', id, 'SKILL.md'), `---\nname: ${name}\ndescription: ${description}\n---\n\n# ${name}\n\n${description}.\n`)
  json('integrations.json', { skills: SKILLS.map(([id, name, description], k) => ({ id, name, description, repo: `https://github.example/${id.replace('__', '/')}.git`, path: file('skills', id), installedAt: now - (9 + k * 4) * DAY, enabled: k !== 1 })), firecrawl: { url: 'http://127.0.0.1:3002', composeDir: '' }, searxng: { url: 'http://127.0.0.1:8888' }, browser: { source: 'off', profile: 'Default', cookiesFile: '', headless: false, testDomain: 'github.com', acks: [] } })
  json('llm-models-openrouter.json', { at: now, models: MODEL_LIST })
  json('copilot-llm-models.json', { at: now, models: MODEL_LIST })
  const { DEFAULT_CONFIG, normalizeConfig } = dist('copilot/config.js')
  json('copilot.json', normalizeConfig({ ...DEFAULT_CONFIG, engine: { ...DEFAULT_CONFIG.engine, openrouter: { ...DEFAULT_CONFIG.engine.openrouter, dataCollection: 'deny' }, models: { fast: 'openai/gpt-4.1-nano', balanced: 'qwen/qwen3-30b-a3b-instruct-2507', deep: 'openai/gpt-6-luna' } } }))
  json('llm-models-groq.json', { at: now, models: MODEL_LIST.filter(m => /llama|gpt-oss|qwen/.test(m.id)).slice(0, 6) })

  const kbJob = evaluated.find(j => j.title === 'Senior Backend Engineer, Data Platform')
  // Run history: evaluations, scans, chats, CV/ATS work spread over four weeks.
  const runs = []
  const run = (o) => { const r = { id: uuid(), input: null, endedAt: o.startedAt + o.ms, status: 'done', usage: null, sessionId: null, jobId: null, ...o }; delete r.ms; runs.push(r); return r }
  const usage = (cost, i, o) => ({ costUsd: cost, inputTokens: i, outputTokens: o, turns: 6 + Math.floor(rand() * 16), durationMs: null })
  const runners = ['claude', 'claude', 'claude', 'codex', 'antigravity', 'claude', 'opencode']
  evaluated.forEach((j, k) => {
    const runner = runners[k % runners.length]
    const cost = runner === 'claude' ? 0.14 + rand() * 0.3 : null
    run({ runner, mode: 'evaluate', label: `Evaluate ${j.company} — ${j.title}`, input: j.url, jobId: j.url, startedAt: Date.parse(`${j.date}T11:00:00Z`) + k * 90_000, ms: 70_000 + Math.floor(rand() * 110_000), usage: usage(cost, 38_000 + Math.floor(rand() * 90_000), 4_000 + Math.floor(rand() * 5_000)) })
  })
  const scanRuns = scans.map(s => run({ runner: 'script', mode: 'scan', label: s.label, input: s.input, startedAt: s.startedAt, ms: s.ms }))
  evaluated.filter(j => j.score >= 4).slice(0, 8).forEach((j, k) => {
    run({ runner: 'claude', mode: k % 2 ? 'cover' : 'pdf', label: k % 2 ? `Cover letter: ${j.company}` : `Tailored CV: ${j.company}`, input: j.report, jobId: j.url, startedAt: Date.parse(`${j.date}T14:00:00Z`) + k * 60_000, ms: 55_000 + k * 6_000, usage: usage(0.09 + rand() * 0.1, 20_000, 3_500) })
    if (k < 4) run({ runner: 'claude', mode: 'ats', label: `ATS check: ${j.company}`, input: j.url, jobId: j.url, startedAt: Date.parse(`${j.date}T15:00:00Z`), ms: 48_000, usage: usage(0.06, 16_000, 2_100) })
  })
  run({ runner: 'research', mode: 'research', label: 'Research questions: Helios Labs — Senior Backend Engineer, Data Platform', startedAt: now - 4 * DAY, ms: 6 * 60_000, usage: { costUsd: 0.31, inputTokens: 210_000, outputTokens: 18_000, turns: null, durationMs: 360_000 }, jobId: kbJob.url })
  run({ runner: 'claude', mode: 'evaluate', label: 'Evaluate Zephyr Mobility — Senior Software Engineer', startedAt: now - 5 * DAY, ms: 41_000, status: 'failed', usage: usage(0.03, 12_000, 600) })
  run({ runner: 'codex', mode: 'followup', label: 'Follow-ups due', startedAt: now - DAY, ms: 52_000, usage: usage(null, 22_000, 1_900) })
  run({ runner: 'claude', mode: 'upskill', label: 'Skill gaps', startedAt: now - 3 * DAY, ms: 66_000, usage: usage(0.11, 31_000, 2_800) })
  seedChats({ write, file, uuid, now, jobs, evaluated, runs, run })
  runs.sort((a, b) => a.startedAt - b.startedAt)
  write(file('runs.jsonl'), runs.map(r => JSON.stringify(r)).join('\n') + '\n')
  scanRuns.forEach((r, k) => write(file('run-logs', `${r.id}.log`), scanLog(scans[k], r)))

  seedKb({ dist, kbDir: file('kb'), jobId: kbJob.url, now, runner: 'claude', model: 'claude-sonnet-4-5', root, cv: ctx.cv, job: kbJob })
  const { normalizeInterviewConfig } = dist('kb/config.js')
  json('interview.json', normalizeInterviewConfig({ research: { consentVersion: '2026-10-v1', search: { backend: 'brave' } } }))
  await seedAts({ dist, file, write, now, cv: ctx.cv, evaluated, kbJob })
  seedCopilot({ dist, file, now, kbJob, evaluated })
}

function scanLog(s, run) {
  const boards = ['Northwind', 'Helios Labs', 'Quillstack', 'Fernwood Systems', 'Tidewater Pay', 'Lumenpath', 'Brightforge', 'Cobalt Harbor', 'Meridian Cloud'].slice(0, s.companies)
  return [`▸ node scan.mjs`, `Scanning ${s.companies} companies …`, ...boards.map((b, i) => `  ${b.padEnd(20)} ${String(3 + ((i * 5 + s.found) % 9)).padStart(2)} postings, ${i % 3 === 0 ? '1 new' : i % 4 === 1 ? '2 new' : 'no new'}`), `Filtered by title: 6, by location: 8, posting age: 2`, `Found ${s.found}, new ${s.added}, duplicates ${Math.max(0, s.found - s.added - 16)}`, `✓ done`].join('\n') + '\n'
}
