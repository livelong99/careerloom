import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { parseReport } from '../job-view/reportParse'
import { candidate, fakeFetch, fakeLlm, synthJobs } from './fakes'
import { runPipeline, type PipelineDeps } from './run'
import { parseRange } from './stage4-write'

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cl-evalpipe-'))

/** In-memory career-ops numbering: reserve() hands out consecutive numbers, like reserve-report-num.mjs --count. */
function harness(over: Partial<PipelineDeps> & { n?: number } = {}) {
  const { n, ...rest } = over
  const world = synthJobs(n ?? 200)
  const base = tmp()
  const root = path.join(base, 'career-ops')
  let next = 1
  let finalized = 0
  const reserveCalls: number[] = []
  const llm = fakeLlm(world)
  const deps = (runId = 'run1'): PipelineDeps => ({
    runId, runDir: path.join(base, 'runs', runId), cacheFile: path.join(base, 'cache.json'), candidate: candidate(), fetchJd: fakeFetch(world), llm,
        write: { root, date: '2026-10-07', runId, reserve: async c => { reserveCalls.push(c); const out = Array.from({ length: c }, (_, i) => String(next + i).padStart(3, '0')); next += c; return out }, finalize: async () => { finalized++ } },
    ...rest,
  })
  return { world, base, root, llm, deps, reserveCalls, finalized: () => finalized }
}

describe('runPipeline', () => {
  it('runs all five stages, accounts every job exactly once and writes valid reports', async () => {
    const h = harness({ n: 200 })
    const out = await runPipeline(h.world, h.deps())
    expect(new Set(out.results.map(r => r.jobId)).size).toBe(out.results.length)
    expect(out.results.length).toBe(h.world.length)
    expect(out.metrics.map(m => m.stage)).toEqual(['fetch', 'filter', 'score', 'llm', 'write'])
    const m = Object.fromEntries(out.metrics.map(x => [x.stage, x]))
    expect(m.fetch!.inCount).toBeLessThan(h.world.length) // the title gates ran before any fetch
    expect(m.filter!.inCount).toBeGreaterThanOrEqual(m.fetch!.outCount) // stage 1 counts the jobs its title gates kept from being fetched
    expect(m.llm!.inCount).toBeLessThan(m.fetch!.outCount); expect(m.llm!.inputTokens).toBeGreaterThan(0)
    const light = out.results.filter(r => r.fate === 'light')
    expect(m.write!.outCount).toBe(light.length)
    expect(h.finalized()).toBe(1)

    const reports = fs.readdirSync(path.join(h.root, 'reports'))
    expect(reports).toHaveLength(light.length)
    const view = parseReport(fs.readFileSync(path.join(h.root, 'reports', reports[0]!), 'utf8'))
    expect(view.company).toBeTruthy(); expect(view.score).toBeGreaterThan(0); expect(view.url).toMatch(/^https:\/\/jobs\.example\.com\//); expect(view.jd).toBeTruthy(); expect(view.decision).toBeTruthy()
    const adds = fs.readdirSync(path.join(h.root, 'batch', 'tracker-additions'))
    const [header, row] = fs.readFileSync(path.join(h.root, 'batch', 'tracker-additions', adds[0]!), 'utf8').trim().split('\n')
    expect(header).toBe('num\tdate\tcompany\trole\tstatus\tscore\tpdf\treport\tnotes\turl')
    expect(row!.split('\t')).toHaveLength(10); expect(row).toMatch(/\t\d\.\d\/5\t/)
    const state = fs.readFileSync(path.join(h.root, 'batch', 'batch-state.tsv'), 'utf8').trim().split('\n')
    expect(state).toHaveLength(light.length + 1)
  })

  it('writes a Skip verdict as a SKIP tracker row and the rest as Evaluated', async () => {
    const h = harness({ n: 120 })
    const out = await runPipeline(h.world, h.deps())
    const rows = fs.readdirSync(path.join(h.root, 'batch', 'tracker-additions')).map(f => fs.readFileSync(path.join(h.root, 'batch', 'tracker-additions', f), 'utf8').split('\n')[1]!.split('\t'))
    const skips = out.results.filter(r => r.fate === 'light' && r.light!.decision === 'Skip').length
    expect(rows.filter(r => r[4] === 'SKIP')).toHaveLength(skips)
    expect(rows.every(r => r[4] === 'SKIP' || r[4] === 'Evaluated')).toBe(true)
  })

  it('reserves report numbers in chunks of at most 50, not per job', async () => {
    const h = harness({ n: 300 })
    await runPipeline(h.world, h.deps())
    expect(Math.max(...h.reserveCalls)).toBeLessThanOrEqual(50)
    expect(h.reserveCalls.length).toBeLessThan(15)
  })

  it('a second run on the same jobs is served from the cache: zero model calls, same verdicts', async () => {
    const h = harness({ n: 120 })
    const first = await runPipeline(h.world, h.deps('a'))
    const calls = h.llm.calls
    const second = await runPipeline(h.world, h.deps('b'))
    expect(h.llm.calls).toBe(calls)
    const fits = Object.fromEntries(first.results.filter(x => x.light).map(x => [x.jobId, x.light!.fit]))
    const cached = second.results.filter(r => r.cached)
    expect(cached.length).toBeGreaterThan(0)
    for (const r of cached) expect(r.light!.fit).toBe(fits[r.jobId])
  })

  it('resumes after cancellation: finished stages and verdicts are reused, nothing is judged twice', async () => {
    const h = harness({ n: 150 })
    const ac = new AbortController()
    let seen = 0
    const asked: string[] = []
    const llm = Object.assign(async (r: Parameters<typeof h.llm>[0]) => { asked.push(...[...r.user.matchAll(/^### (\S+)$/gm)].map(m => m[1]!)); if (++seen === 3) ac.abort(); return h.llm(r) }, { calls: 0 })
    const partial = await runPipeline(h.world, { ...h.deps(), llm, signal: ac.signal })
    expect(partial.cancelled).toBe(true)
    expect(fs.existsSync(path.join(h.base, 'runs', 'run1', 's0.json'))).toBe(true)
    expect(fs.existsSync(path.join(h.base, 'runs', 'run1', 's3.json'))).toBe(false)
    expect(fs.existsSync(path.join(h.root, 'reports'))).toBe(false) // nothing written while cancelled

    const fetched = { n: 0 }
    const done = await runPipeline(h.world, { ...h.deps(), llm, fetchJd: async j => { fetched.n++; return fakeFetch(h.world)(j) } })
    expect(fetched.n).toBe(0) // stage 0 came from its checkpoint
    expect(done.cancelled).toBe(false)
    const judged = done.results.filter(r => r.stage === 'llm')
    expect(judged.length).toBeGreaterThan(0)
    expect(asked.length).toBe(new Set(asked).size) // no job was sent to the model twice across the cancelled and resumed runs
    expect(new Set(asked).size).toBe(judged.length)
  })

  it('never writes a job twice when the run is repeated into the same folder', async () => {
    const h = harness({ n: 60 })
    await runPipeline(h.world, h.deps())
    const n = fs.readdirSync(path.join(h.root, 'reports')).length
    await runPipeline(h.world, h.deps())
    expect(fs.readdirSync(path.join(h.root, 'reports')).length).toBe(n)
  })

  it('a failing merge step does not lose the written reports or make a re-run write them twice', async () => {
    const h = harness({ n: 60 })
    const base = h.deps()
    const out = await runPipeline(h.world, { ...base, write: { ...base.write!, finalize: async () => { throw new Error('merge exploded') } } })
    const n = fs.readdirSync(path.join(h.root, 'reports')).length
    expect(n).toBeGreaterThan(0)
    expect(out.metrics.find(m => m.stage === 'write')).toMatchObject({ errors: 1, note: expect.stringContaining('merge exploded') })
    await runPipeline(h.world, h.deps())
    expect(fs.readdirSync(path.join(h.root, 'reports')).length).toBe(n)
  })

  it('dry run (write: null) touches nothing outside the run folder', async () => {
    const h = harness({ n: 40, write: null })
    const out = await runPipeline(h.world, h.deps())
    expect(out.metrics.some(m => m.stage === 'write')).toBe(false)
    expect(fs.existsSync(h.root)).toBe(false)
  })

  it('parseRange handles single numbers, ranges and zero padding, and rejects a wrong count', () => {
    expect(parseRange('007', 1)).toEqual(['007'])
    expect(parseRange('098-101', 4)).toEqual(['098', '099', '100', '101'])
    expect(() => parseRange('007-009', 2)).toThrow(/Asked for 2/)
    expect(() => parseRange('nope', 1)).toThrow(/Unexpected/)
  })
})
