// @vitest-environment node
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { beforeEach, describe, expect, it } from 'vitest'

import type { KbItem, ResearchOptions, ResearchProgress } from '../types'
import type { KbData } from '../store'
import { createFetcher } from './fetch'
import { createFakeLlm } from './fixtures/llm'
import { CV, JOB } from './fixtures/job'
import { ALL_RESULTS, createFakeWeb, URLS } from './fixtures/web'
import { MAX_ITEMS, runResearch, type PipelineDeps } from './pipeline'
import { inputHashOf } from './plan'
import { clearRobotsCache } from './robots'
import { createFakeBackend } from './search/fake'
import { memoryResearchState, openResearchState } from './state'

const OPTS: ResearchOptions = { depth: 'standard', budgetUsd: 0.3, minutes: 5, allowAgent: false }
const HASH = inputHashOf({ jd: JOB.techStack, gaps: JOB.gaps, role: JOB.title, company: JOB.company })
beforeEach(() => clearRobotsCache())

function memStore(initial: Partial<KbData> = {}) {
  let data: KbData = { manifest: null, items: [], sources: [], skills: [], notes: { company: [], role: [], interviewerStyle: [], loop: [] }, ...initial }
  const commits: Array<Partial<KbData>> = []
  return { read: () => data, commit: (_id: string, d: Partial<KbData>) => { commits.push(d); data = { ...data, ...d }; return data }, commits, get data() { return data } }
}

function rig({ web: w, llm: l, search: sr, ...over }: Omit<Partial<PipelineDeps>, 'llm'> & { llm?: ReturnType<typeof createFakeLlm>; web?: ReturnType<typeof createFakeWeb>; search?: ReturnType<typeof createFakeBackend> } = {}) {
  const web = w ?? createFakeWeb()
  const llm = l ?? createFakeLlm()
  const search = sr ?? createFakeBackend({ results: () => ALL_RESULTS })
  const store = memStore()
  const state = memoryResearchState()
  const progress: ResearchProgress[] = []
  const deps: PipelineDeps = {
    runId: 'run-1', job: JOB, inputHash: HASH, backends: [search], fetch: createFetcher({ ...web.deps, company: JOB.company }), llm: llm.call, store, state,
    onProgress: p => progress.push(p), signal: new AbortController().signal, now: web.deps.now, concurrency: 6, ...over,
  }
  return { deps, web, llm, search, store, state, progress }
}

describe('runResearch end to end on fakes', () => {
  it('produces a valid KB: sourced items with sources, notes, coverage, manifest, run record cleared', async () => {
    const r = rig()
    const res = await runResearch(JOB.jobId, OPTS, r.deps)
    expect(res.status).toBe('complete')
    const kb = r.store.data
    expect(kb.manifest).toMatchObject({ schema: 1, status: 'complete', jobId: JOB.jobId, inputHash: HASH, searches: res.searches })
    expect(kb.items.length).toBeGreaterThanOrEqual(10)
    expect(kb.items.length).toBeLessThanOrEqual(MAX_ITEMS)
    expect(new Set(kb.items.map(i => i.id)).size).toBe(kb.items.length)
    expect(kb.notes.loop[0]).toContain('four interviewers')
    expect(kb.notes.company.length).toBe(1)
    expect(kb.skills.length).toBeGreaterThan(3)
    expect(Object.keys(kb.manifest!.coverage)).toEqual(kb.skills.map(s => s.id))
    expect(r.state.runs.size).toBe(0) // checkpoint deleted on completion
    // sources are only pages that contributed, and carry licence/trust but no page text
    expect(kb.sources.map(s => s.host)).toEqual(expect.arrayContaining(['stackoverflow.com', 'github.com', 'careers.acme-corp.com']))
    for (const s of kb.sources) expect(Object.keys(s).sort()).toEqual(['contentHash', 'fetchedAt', 'host', 'id', 'kind', 'licence', 'title', 'trust', 'url'])
    expect(kb.sources.find(s => s.host === 'stackoverflow.com')).toMatchObject({ licence: 'CC BY-SA 4.0', kind: 'qa-site' })
  })

  it('property: every sourced item has ≥ 1 fetched source and its question text came from a page that held the evidence', async () => {
    const r = rig({ llm: createFakeLlm({ hallucinate: true }) })
    await runResearch(JOB.jobId, OPTS, r.deps)
    const kb = r.store.data
    const sourceIds = new Set(kb.sources.map(s => s.id))
    const sourced = kb.items.filter(i => i.provenance === 'sourced')
    expect(sourced.length).toBeGreaterThan(5)
    for (const it of sourced) {
      expect(it.sources.length).toBeGreaterThanOrEqual(1)
      expect(it.sources.every(s => sourceIds.has(s.sourceId))).toBe(true)
      expect(it.seen).toBe(it.sources.length)
    }
    expect(kb.items.some(i => /quantum compiler/.test(i.text))).toBe(false) // invented item: evidence not on the page ⇒ dropped
    for (const it of kb.items.filter(i => i.provenance === 'generated')) expect(it.sources).toEqual([])
  })

  it('dedupes across sources (same question on two pages ⇒ one item, seen 2) and keeps generated ≤ 30 % (+ floor)', async () => {
    const r = rig()
    await runResearch(JOB.jobId, OPTS, r.deps)
    const closure = r.store.data.items.filter(i => /closures capture variables/i.test(i.text))
    expect(closure).toHaveLength(1)
    expect(closure[0]).toMatchObject({ seen: 2, provenance: 'sourced' })
    expect(closure[0]!.confidence).toBeGreaterThan(0.5)
    const gen = r.store.data.items.filter(i => i.provenance === 'generated')
    expect(gen.every(g => g.confidence <= 0.4)).toBe(true)
    expect(gen.length).toBeLessThanOrEqual(Math.max(6, Math.floor(r.store.data.items.length * 0.3)))
  })

  it('safety: never-fetch hosts, robots-disallowed and private redirects are skipped; the poisoned page yields no item and no URL', async () => {
    const r = rig()
    const res = await runResearch(JOB.jobId, OPTS, r.deps)
    const reqs = r.web.counters.http.filter(u => !u.endsWith('/robots.txt'))
    for (const bad of [URLS.reddit, URLS.glassdoor, URLS.linkedin, URLS.noRobots]) expect(reqs).not.toContain(bad)
    expect(reqs).toContain(URLS.toPrivate)
    expect(reqs.some(u => u.startsWith('http://169.254'))).toBe(false)
    expect(res.skipped).toBeGreaterThanOrEqual(5)
    const all = JSON.stringify(r.store.data)
    expect(all).not.toMatch(/evil\.example|pwn|claim your prize|ignore all previous/i)
    expect(r.store.data.items.some(i => /promise differs from a callback/.test(i.text))).toBe(false) // injection pages are dropped whole
    expect(r.llm.seen.some(u => /evil\.example|Ignore all previous/i.test(u))).toBe(false) // …and never even reach the model
    expect(r.store.data.sources.some(s => s.url === URLS.poison)).toBe(false)
  })

  it('thin pages fall back to CDP and still contribute', async () => {
    const r = rig()
    await runResearch(JOB.jobId, OPTS, r.deps)
    expect(r.web.counters.cdp).toContain(URLS.thin)
    expect(r.store.data.items.some(i => /web address and seeing the page paint/.test(i.text))).toBe(true)
  })

  it('privacy: nothing from the cv reaches search queries, page requests or the model', async () => {
    const r = rig()
    await runResearch(JOB.jobId, OPTS, r.deps)
    const out = [...r.search.calls, ...r.web.counters.http, ...r.llm.seen].join('\n')
    for (const leak of ['priya', 'raghunathan', '98765', '@example.com', 'Lotus Street', 'jQuery bundle', 'checkout surface']) expect(out.toLowerCase()).not.toContain(leak.toLowerCase())
    expect(r.search.calls.length).toBeGreaterThan(8)
  })

  it('emits ordered progress phases with spend and counts, and keeps cost inside the cap', async () => {
    const r = rig()
    const res = await runResearch(JOB.jobId, OPTS, r.deps)
    const phases = [...new Set(r.progress.map(p => p.phase))]
    expect(phases).toEqual(['plan', 'search', 'fetch', 'extract', 'dedupe', 'generate', 'commit'])
    const last = r.progress.at(-1)!
    expect(last).toMatchObject({ runId: 'run-1', phase: 'commit', done: 1, total: 1, note: 'complete' })
    expect(last.spentUsd).toBeCloseTo(res.costUsd, 5)
    expect(res.costUsd).toBeLessThanOrEqual(OPTS.budgetUsd)
    expect(r.progress.every(p => p.spentUsd >= 0 && p.elapsedMs >= 0)).toBe(true)
  })

  it('no search backend / noSearch: a small, honestly generated bank (no pages, no spend on search)', async () => {
    for (const o of [{ backends: [] }, { opts: { ...OPTS, noSearch: true } }]) {
      const r = rig('backends' in o ? o : {})
      const res = await runResearch(JOB.jobId, (o as { opts?: ResearchOptions }).opts ?? OPTS, r.deps)
      expect(res.sourced).toBe(0)
      expect(res.generated).toBeGreaterThan(0)
      expect(res.generated).toBeLessThanOrEqual(6)
      expect(r.web.counters.http).toEqual([])
    }
  })

  it('search fallback: a failing backend is skipped after two failures and the next one serves', async () => {
    const bad = Object.assign(createFakeBackend({ failOn: () => new Error('401') }), { id: 'brave' as const })
    const good = createFakeBackend({ results: () => ALL_RESULTS })
    const r = rig({ backends: [bad, good] })
    const res = await runResearch(JOB.jobId, OPTS, r.deps)
    expect(res.status).toBe('complete')
    expect(bad.calls).toHaveLength(2)
    expect(good.calls.length).toBeGreaterThan(8)
  })

  it('a user\'s own, pinned, hidden or edited items survive a refresh; stale generated ones do not', async () => {
    const r = rig()
    await runResearch(JOB.jobId, OPTS, r.deps)
    const first = r.store.data.items
    const mine: KbItem = { ...first[0]!, id: 'user-1', text: 'My own question about shipping on Fridays?', provenance: 'user', confidence: 1 }
    const pinned: KbItem = { ...first[1]!, user: { ...first[1]!.user, pinned: true }, text: 'A pinned question that no page mentions any more?', id: 'pin-1' }
    const stale: KbItem = { ...first[2]!, id: 'stale-1', text: 'A stale sourced question nobody found this time?' }
    r.store.commit(JOB.jobId, { items: [...first, mine, pinned, stale] })
    await runResearch(JOB.jobId, OPTS, { ...r.deps, state: memoryResearchState() })
    const ids = new Set(r.store.data.items.map(i => i.id))
    expect(ids.has('user-1') && ids.has('pin-1')).toBe(true)
    expect(ids.has('stale-1')).toBe(false)
  })
})

describe('budget', () => {
  it('a tiny cap stops the run and marks the KB partial, never overspending by more than one call', async () => {
    const r = rig({ search: createFakeBackend({ results: () => ALL_RESULTS, usdPerCall: 0.005 }), llm: createFakeLlm({ usd: 0.004 }) })
    const res = await runResearch(JOB.jobId, { ...OPTS, budgetUsd: 0.13 }, r.deps)
    expect(res.status).toBe('partial')
    expect(res.costUsd).toBeLessThanOrEqual(0.13 + 0.004 + 1e-9)
    expect(r.store.data.manifest!.status).toBe('partial')
    expect(r.store.data.items.length).toBeGreaterThan(0)
  })
  it('a time cap marks partial too', async () => {
    const web = createFakeWeb()
    let calls = 0
    const llm = createFakeLlm()
    const r = rig({ web, llm: { ...llm, call: async (s, u, sg) => { if (++calls === 3) web.clock.t += 6 * 60_000; return llm.call(s, u, sg) } } })
    const res = await runResearch(JOB.jobId, OPTS, r.deps)
    expect(res.status).toBe('partial')
  })
  it('a zero-result, zero-yield run is "failed", not an empty "complete"', async () => {
    const r = rig({ llm: createFakeLlm({ fail: () => new Error('model down') }), backends: [createFakeBackend({ results: () => [] })] })
    const res = await runResearch(JOB.jobId, OPTS, r.deps)
    expect(res.status).toBe('failed')
  })
})

describe('resume', () => {
  it('a kill mid-fetch then a re-run reproduces the same KB without re-searching or re-fetching finished work', async () => {
    const clean = rig()
    await runResearch(JOB.jobId, OPTS, clean.deps)

    const web = createFakeWeb()
    const state = memoryResearchState()
    const llm = createFakeLlm()
    const search = createFakeBackend({ results: () => ALL_RESULTS })
    const ac = new AbortController()
    let extracts = 0
    const killing: PipelineDeps['llm'] = async (s, u, sg) => { if (s.startsWith('You extract') && ++extracts === 4) { ac.abort(); sg.throwIfAborted() } return llm.call(s, u, sg) }
    const store = memStore()
    const base = { ...rig({ web, llm, search }).deps, store, state }
    await expect(runResearch(JOB.jobId, OPTS, { ...base, llm: killing, signal: ac.signal, concurrency: 1 })).rejects.toBeDefined()
    expect(store.commits).toHaveLength(0)
    const cp = state.runs.get(JOB.jobId)!
    expect(cp).toBeDefined()
    const searchesBefore = search.calls.length, pagesBefore = Object.keys(cp.pages).length, spentBefore = cp.spentUsd
    expect(pagesBefore).toBeGreaterThan(0)

    // second attempt: a fresh cache layer proves the checkpoint (not the cache) carries the resume
    const web2 = createFakeWeb()
    const resumed = await runResearch(JOB.jobId, OPTS, { ...base, fetch: createFetcher({ ...web2.deps, company: JOB.company }), state: Object.assign(memoryResearchState(), { loadRun: state.loadRun, saveRun: state.saveRun, clearRun: state.clearRun }), signal: new AbortController().signal })
    expect(search.calls.length).toBe(searchesBefore) // every query was already in the checkpoint
    const refetched = web2.counters.http.filter(u => !u.endsWith('/robots.txt'))
    for (const done of Object.keys(cp.pages)) expect(refetched).not.toContain(done)
    expect(resumed.costUsd).toBeGreaterThan(spentBefore) // the seeded spend carries over, and only new work added to it
    expect(store.data.items.map(i => i.id)).toEqual(clean.store.data.items.map(i => i.id))
    expect(store.data.sources.map(s => s.url)).toEqual(clean.store.data.sources.map(s => s.url))
    expect(store.data.manifest!.status).toBe('complete')
  })
  it('a checkpoint from a different posting is ignored', async () => {
    const r = rig()
    r.state.saveRun({ schema: 1, jobId: JOB.jobId, inputHash: 'stale', startedAt: 0, spentUsd: 0.29, searches: 99, queries: { 'x': [] }, pages: {} })
    const res = await runResearch(JOB.jobId, OPTS, r.deps)
    expect(res.status).toBe('complete')
    expect(res.searches).toBeLessThan(99)
  })
})

describe('disk state', () => {
  it('run.json and caches are written atomically with private modes, hold no page text, and expire', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'kb-state-'))
    try {
      let t = 1_000
      const state = openResearchState(() => root, id => `job-${id.length}`, () => t)
      const web = createFakeWeb()
      const r = rig({ web })
      await runResearch(JOB.jobId, OPTS, { ...r.deps, state, now: () => t })
      const files = fs.readdirSync(path.join(root, '_cache', 'pages'))
      expect(files.length).toBeGreaterThan(3)
      const stat = fs.statSync(path.join(root, '_cache', 'pages', files[0]!))
      expect(stat.mode & 0o777).toBe(0o600)
      expect(fs.statSync(path.join(root, '_cache')).mode & 0o777).toBe(0o700)
      const dump = files.map(f => fs.readFileSync(path.join(root, '_cache', 'pages', f), 'utf8')).join('\n')
      expect(dump).not.toContain('This synthetic page exists only') // page text is never persisted
      expect(dump).not.toContain('<html')
      expect(fs.existsSync(path.join(root, `job-${JOB.jobId.length}`, 'run.json'))).toBe(false)
      expect(state.getPage(URLS.so)).not.toBeNull()
      t += 15 * 86_400_000
      expect(state.getPage(URLS.so)).toBeNull() // 14 d TTL
      expect(state.getQuery('fake', 'x')).toBeNull()
    } finally { fs.rmSync(root, { recursive: true, force: true }) }
  })
  it('a second run is served from the page/query caches: no new network, no model spend on pages', async () => {
    const a = rig({})
    const state = memoryResearchState(a.web.deps.now)
    await runResearch(JOB.jobId, OPTS, { ...a.deps, state })
    const b = rig({}); await runResearch(JOB.jobId, OPTS, { ...b.deps, state })
    expect(b.search.calls).toHaveLength(0)
    expect(b.web.counters.http.filter(u => !u.endsWith('/robots.txt'))).toEqual([])
    expect(b.llm.calls.extract).toBe(0)
  })
  it('cv fixture is only used to reject queries, never sent', () => { expect(CV.length).toBeGreaterThan(100) })
})
