import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import type { JobListing } from '../contract'
import { CV, PROFILE_YML, fakeLlm, synthJobs } from './fakes'

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cl-live-'))
fs.mkdirSync(path.join(root, 'config'), { recursive: true })
fs.writeFileSync(path.join(root, 'cv.md'), CV)
fs.writeFileSync(path.join(root, 'config', 'profile.yml'), PROFILE_YML)
const world = synthJobs(60, 9, 0)
const llm = fakeLlm(world)
const agentCalls: string[] = []
const scripts: string[][] = []
let next = 0
const escalated: string[][] = []

vi.mock('electron', () => ({ app: { getPath: () => os.tmpdir() }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: {} }))
vi.mock('../context', async orig => ({
  ...(await orig<object>()),
  careerOpsRoot: () => root, dataRoot: () => root,
  readSettings: () => ({ runner: 'claude', models: {}, helperModels: {}, prefs: { evalPipeline: { enabled: true } }, llm: { helper: null, customBaseUrl: null } }),
  runScript: async (args: string[]) => {
    scripts.push(args)
    if (args[0] === 'reserve-report-num.mjs' && args[1] === '--count') { const n = Number(args[2]); const lo = next + 1; next += n; return { code: 0, stdout: n === 1 ? `${String(lo).padStart(3, '0')}\n` : `${String(lo).padStart(3, '0')}-${String(next).padStart(3, '0')}\n`, stderr: '' } }
    return { code: 0, stdout: '', stderr: '' }
  },
  startAgentPrompt: (_l: string, _m: string, prompt: string, _i: unknown, opts: { onExit: (r: unknown) => void }) => {
    agentCalls.push(prompt)
    void llm({ system: '', user: prompt }).then(r => opts.onExit({ status: 'done', log: `▸ thinking [1]\n${r.text}`, usage: { inputTokens: r.inputTokens, outputTokens: r.outputTokens, costUsd: 0.001 } }))
    return {}
  },
}))
vi.mock('../jobs-batch', () => ({
  profileProblems: () => [], mergeTracker: async () => { scripts.push(['merge']) },
  prefetchJd: async (url: string) => world.find(j => j.url === url)?.jd ?? '',
  evaluateSelected: async (jobs: JobListing[]) => { escalated.push(jobs.map(j => j.id)); return {} },
}))
const { evaluateStaged } = await import('./live')
const { runs } = await import('../context')

const listing = (j: (typeof world)[number]): JobListing => ({ id: j.id, url: j.url, title: j.title, company: j.company, portalId: null, ats: null, location: j.location, postedAt: null, firstSeen: null, trustScore: null, trustFlags: [], state: 'new', status: null, score: null, reportNum: null, reportPath: null, evaluatedAt: null, stale: false })
const finished = async (id: string) => { for (let i = 0; i < 200 && runs.get(id)?.status === 'running'; i++) await new Promise(r => setTimeout(r, 25)); return runs.get(id)! }

describe('evaluateStaged', () => {
  it('runs as one tracked Run: quick reports on disk, one merge, skips explained, best matches escalated', async () => {
    const sum = await evaluateStaged(world.map(listing), {})
    const run = await finished(sum.id)
    expect(run.status).toBe('done')
    expect(run.log).toMatch(/▸ fetch: \d+ → \d+/); expect(run.log).toMatch(/quick reports written/)
    expect(run.usage?.inputTokens).toBeGreaterThan(0)
    const reports = fs.readdirSync(path.join(root, 'reports'))
    expect(reports.length).toBeGreaterThan(0)
    expect(scripts.filter(a => a[0] === 'merge')).toHaveLength(1)
    expect(scripts.filter(a => a[0] === 'reconcile-pipeline.mjs')).toHaveLength(1)
    expect(scripts.filter(a => a[1] === '--count').length).toBeLessThan(3)
    expect(Math.max(...agentCalls.map(p => p.length))).toBeLessThan(16_000) // safe command-line length
    const store = JSON.parse(fs.readFileSync(path.join(root, 'data', 'careerloom-prescreen.json'), 'utf8')) as { results: Record<string, { bucket: string; reason: string }> }
    expect(Object.values(store.results).every(e => e.bucket === 'unlikely' && e.reason)).toBe(true)
    expect(escalated.flat().length).toBeGreaterThan(0)
  })

  it('starting the same selection again after it finished starts a fresh run folder and serves verdicts from the cache', async () => {
    const calls = agentCalls.length
    const sum = await evaluateStaged(world.map(listing), {})
    const run = await finished(sum.id)
    expect(run.status).toBe('done')
    expect(agentCalls.length).toBe(calls) // every verdict came from eval-cache.json
    expect(escalated).toHaveLength(2) // …and the cached high-fit jobs still go to the deep evaluation
    expect(escalated[1]).toEqual(escalated[0])
    const dirs = fs.readdirSync(path.join(root, 'batch', 'careerloom', 'eval-runs')).filter(d => !d.endsWith('.json'))
    expect(dirs.length).toBe(2)
  })

  it('refuses a second staged run while one is in flight (same checkpoints, double reports)', async () => {
    const first = evaluateStaged(world.slice(0, 20).map(listing), {})
    await expect(evaluateStaged(world.slice(0, 20).map(listing), {})).rejects.toThrow(/already running/)
    await finished((await first).id)
    await expect(evaluateStaged(world.slice(0, 20).map(listing), {}).then(s => finished(s.id))).resolves.toBeTruthy()
  })
})
