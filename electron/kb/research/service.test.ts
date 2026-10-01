// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', () => ({ app: { getPath: () => '/tmp', getVersion: () => '0.2.0' }, BrowserWindow: { getAllWindows: () => [] }, safeStorage: {} }))

import type { RunRecord, RunStart } from '../../context'
import { DEFAULT_INTERVIEW_CONFIG } from '../config'
import type { KbData } from '../store'
import type { InterviewConfig, KbEvents } from '../types'
import { createFakeLlm } from './fixtures/llm'
import { CV, JOB } from './fixtures/job'
import { ALL_RESULTS, createFakeWeb } from './fixtures/web'
import { clearRobotsCache } from './robots'
import { createFakeBackend } from './search/fake'
import { createResearchService, ResearchRefused, type ServiceEnv } from './service'
import { memoryResearchState } from './state'

beforeEach(() => clearRobotsCache())
const cfg = (over: Partial<InterviewConfig['research']> = {}): InterviewConfig => ({ ...DEFAULT_INTERVIEW_CONFIG, research: { ...DEFAULT_INTERVIEW_CONFIG.research, consentVersion: '1', ...over } })
const OPTS = { depth: 'standard' as const, budgetUsd: 0.3, minutes: 5, allowAgent: false }
const POSTING = { title: JOB.title, company: JOB.company, location: null, workMode: null, employmentType: null, seniority: 'Senior', salary: null, summary: null, responsibilities: [], requirements: { required: ['React'], preferred: [] }, benefits: [], aboutCompany: null, techStack: JOB.techStack, skills: JOB.skills, fullDescription: null, deadline: null }

/** A launchTask stand-in with the same contract: registers a record, runs `work`, flips status, calls onExit. */
function harness(over: Partial<ServiceEnv> = {}, config: InterviewConfig = cfg()) {
  const web = createFakeWeb()
  const llm = createFakeLlm()
  const runs = new Map<string, RunRecord>()
  const events: Array<[string, unknown]> = []
  const launched: RunStart[] = []
  let commits = 0
  const done = new Map<string, Promise<void>>()
  let data: KbData = { manifest: null, items: [], sources: [], skills: [], notes: { company: [], role: [], interviewerStyle: [], loop: [] } }
  const env: ServiceEnv = {
    config: () => config, secret: id => (id === 'brave' ? 'key-brave' : null),
    job: () => ({ title: JOB.title, company: JOB.company, posting: POSTING, gaps: JOB.gaps, cv: CV, userName: JOB.userName }),
    llm: async (prompt, jobId) => { expect(jobId).toBe(JOB.jobId); const r = await llm.call(prompt.slice(0, prompt.indexOf('\n\n')), prompt.slice(prompt.indexOf('\n\n') + 2), new AbortController().signal); return { text: r.text, tokens: 1000, model: 'fake-model' } },
    store: () => ({ read: () => data, commit: (_id, d) => { commits++; data = { ...data, ...d }; return data } }),
    state: memoryResearchState(web.deps.now), net: web.deps,
    launch: (record, work, onExit) => {
      launched.push(record)
      const run = { ...record, id: `run-${runs.size + 1}`, startedAt: 1, endedAt: null, status: 'running', usage: null, log: '' } as RunRecord
      runs.set(run.id, run)
      done.set(run.id, work(t => { run.log += t }, run).then(() => { if (run.status === 'running') run.status = 'done' }, err => { run.log += `\n✗ ${(err as Error).message}\n`; if (run.status === 'running') run.status = 'failed' }).finally(() => { run.endedAt = 2; onExit?.(run) }))
      return run
    },
    getRun: id => runs.get(id),
    emit: (e, p) => { events.push([e, p]) },
    priceCall: () => 0.002,
    backends: () => [createFakeBackend({ results: () => ALL_RESULTS })],
    ...over,
  }
  return { env, svc: createResearchService(env), runs, events, launched, done, llm, web, get commits() { return commits }, get data() { return data } }
}

describe('research service', () => {
  it('registers a Run (kind research, mode job-research, jobId stamped), streams progress, completes, announces kbChanged', async () => {
    const h = harness()
    const { runId } = h.svc.start(JOB.jobId, OPTS)
    expect(h.launched).toEqual([{ runner: 'research', mode: 'job-research', label: 'Job research · Senior Frontend Engineer', input: JOB.jobId, jobId: JOB.jobId }])
    expect(h.svc.running(JOB.jobId)).toBe(runId)
    await h.done.get(runId)
    const run = h.runs.get(runId)!
    expect(run.status).toBe('done')
    expect(run.log).toMatch(/Researching Senior Frontend Engineer at Acme Corp/)
    expect(run.log).toMatch(/✓ complete: \d+ questions \(\d+ sourced, \d+ generated\)/)
    const kinds = h.events.map(([e]) => e)
    expect(kinds.at(-1)).toBe('kbChanged')
    expect(h.events.filter(([e]) => e === 'kbProgress').every(([, p]) => (p as KbEvents['kbProgress']).runId === runId)).toBe(true)
    expect(h.commits).toBe(1)
    expect(h.data.manifest).toMatchObject({ status: 'complete', jobId: JOB.jobId, runner: 'research', model: 'fake-model' })
    expect(h.svc.running(JOB.jobId)).toBeNull()
  })

  it('refuses without consent, without a search path, twice for one job, and for bad ids', async () => {
    expect(() => harness({}, cfg({ consentVersion: null })).svc.start(JOB.jobId, OPTS)).toThrow(/Review what research sends/)
    const noKey = harness({ backends: undefined, secret: () => null })
    expect(() => noKey.svc.start(JOB.jobId, OPTS)).toThrow(/Add a search key/)
    expect(noKey.svc.estimate(JOB.jobId, OPTS)).toMatchObject({ backend: 'none', needsKey: true })
    const h = harness()
    const { runId } = h.svc.start(JOB.jobId, OPTS)
    expect(() => h.svc.start(JOB.jobId, OPTS)).toThrow(ResearchRefused)
    await h.done.get(runId)
    for (const bad of ['', '   ', 'x'.repeat(2001), 5 as unknown as string]) expect(() => h.svc.start(bad, OPTS)).toThrow(/not valid/)
    expect(() => h.svc.start(JOB.jobId, { ...OPTS, depth: 'insane' as never })).toThrow(/depth/)
  })

  it('noSearch needs no key and produces a small generated bank', async () => {
    const h = harness({ backends: undefined, secret: () => null })
    const { runId } = h.svc.start(JOB.jobId, { ...OPTS, noSearch: true })
    await h.done.get(runId)
    expect(h.runs.get(runId)!.status).toBe('done')
    expect(h.data.items.every(i => i.provenance === 'generated')).toBe(true)
    expect(h.svc.estimate(JOB.jobId, { ...OPTS, noSearch: true })).toMatchObject({ backend: 'none', needsKey: false })
    expect(h.svc.estimate(JOB.jobId, { ...OPTS, noSearch: true }).usdHigh).toBeLessThanOrEqual(0.03)
  })

  it('builds the real backend chain from keys and config: keyed ones first in order, SearXNG only with its address', async () => {
    const seen: string[] = []
    const f = (async (url: string) => { seen.push(String(url)); return new Response(JSON.stringify({ results: [] }), { status: 200 }) }) as unknown as typeof fetch
    const h = harness({ backends: undefined, secret: id => (id === 'exa' ? 'k'.repeat(20) : null), fetch: f }, cfg({ search: { backend: 'brave', fallbackOrder: ['brave', 'exa', 'serper', 'searxng'], searxngUrl: 'http://127.0.0.1:8080' } }))
    expect(h.svc.estimate(JOB.jobId, OPTS)).toMatchObject({ backend: 'exa', needsKey: false })
    const { runId } = h.svc.start(JOB.jobId, OPTS)
    await h.done.get(runId)
    expect(seen[0]).toBe('https://api.exa.ai/search')
    expect(h.runs.get(runId)!.log).not.toContain('k'.repeat(20))
  })

  it('estimate: cost scales with depth, never exceeds the cap, and the cap is clamped to $2', () => {
    const h = harness()
    const q = h.svc.estimate(JOB.jobId, { ...OPTS, depth: 'quick' }), d = h.svc.estimate(JOB.jobId, { ...OPTS, depth: 'deep', budgetUsd: 99 })
    expect(d.usdHigh).toBeGreaterThan(q.usdHigh)
    expect(d.usdHigh).toBeLessThanOrEqual(2)
    expect(h.svc.estimate(JOB.jobId, { ...OPTS, budgetUsd: 0.1 }).usdHigh).toBeLessThanOrEqual(0.1)
    expect(d.minutes).toBeGreaterThan(q.minutes)
  })

  it('stop() cancels the Run, aborts the pipeline, commits nothing and keeps the checkpoint for resume', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const slow = createFakeBackend({ results: () => ALL_RESULTS })
    const orig = slow.search.bind(slow)
    slow.search = async (q, s) => { await gate; return orig(q, s) }
    const h = harness({ backends: () => [slow] })
    const { runId } = h.svc.start(JOB.jobId, OPTS)
    h.svc.stop(runId)
    release()
    await h.done.get(runId)
    expect(h.runs.get(runId)!.status).toBe('cancelled')
    expect(h.commits).toBe(0)
    expect(h.svc.running(JOB.jobId)).toBeNull()
    h.svc.stop('does-not-exist') // harmless
  })

  it('a cancel from the Runs page (status flip) also stops the pipeline', async () => {
    let release!: () => void
    const gate = new Promise<void>(r => { release = r })
    const slow = createFakeBackend({ results: () => ALL_RESULTS })
    const orig = slow.search.bind(slow)
    slow.search = async (q, s) => { await gate; return orig(q, s) }
    const h = harness({ backends: () => [slow] })
    const { runId } = h.svc.start(JOB.jobId, OPTS)
    h.runs.get(runId)!.status = 'cancelled'
    await new Promise(r => setTimeout(r, 400))
    release()
    await h.done.get(runId)
    expect(h.runs.get(runId)!.status).toBe('cancelled')
    expect(h.commits).toBe(0)
  })

  it('a run that finds nothing is marked failed with a plain message', async () => {
    const h = harness({ backends: () => [createFakeBackend({ results: () => [] })], llm: async () => { throw new Error('model down') } })
    const { runId } = h.svc.start(JOB.jobId, OPTS)
    await h.done.get(runId)
    expect(h.runs.get(runId)!.status).toBe('failed')
    expect(h.runs.get(runId)!.log).toMatch(/found nothing usable/)
  })
})
