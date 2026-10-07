import { describe, expect, it } from 'vitest'

import { candidate, fakeFetch, fakeLlm, synthJobs } from './fakes'
import { cacheKey, fileCache, jdHash, stage0, type VerdictCache } from './stage0-fetch'
import { advertisedPayMax, stage1, yearsAsked } from './stage1-filter'
import { localScore, stage2 } from './stage2-score'
import { excerpt, extractArray, parseBatch, stage3 } from './stage3-batch'
import { buildCvIndex } from '../ats/skills'
import { DEFAULT_CONFIG, type FetchedJob, type Light } from './types'

const mem = (): VerdictCache => { const m = new Map<string, Light>(); return { get: k => m.get(k), set: (k, v) => { m.set(k, v) }, flush: () => {} } }
const job = (id: string, over: Partial<FetchedJob> = {}): FetchedJob => ({ id, url: id, title: 'Senior Backend Engineer', company: 'Acme', location: 'Pune, India', jd: 'We need Java and Kafka. 5+ years of experience.', jdHash: jdHash(id + (over.jd ?? '')), ...over })
const light = (fit: number): Light => ({ fit, decision: 'Consider', archetype: 'Backend', summary: 's', strengths: [], gaps: [], hardStop: null })

describe('stage 0', () => {
  it('gates before fetching, dedupes by JD text per place, fetches each once, reports failures', async () => {
    const calls: string[] = []
    const jobs = [
      { id: 'a', url: 'a', title: 'T', company: 'C', location: 'X' },
      { id: 'c', url: 'c', title: 'T2', company: 'C', location: 'X' }, // different title, same JD text and place as a
      { id: 'd', url: 'd', title: 'T3', company: 'C', location: 'X' }, // fetch fails
      { id: 'e', url: 'e', title: 'T4', company: 'C', location: 'X' }, // empty JD
      { id: 'g', url: 'g', title: 'Sales Manager', company: 'C', location: 'X' }, // gated: never fetched
    ]
    const texts: Record<string, string> = { a: 'Same JD text here', c: 'same   jd TEXT here', e: '  ' }
    const out = await stage0(jobs, { gate: j => (j.title === 'Sales Manager' ? 'Function: sales' : null), fetchJd: async j => { calls.push(j.id); if (j.id === 'd') throw new Error('boom'); return texts[j.id] ?? '' }, cache: mem(), profileKey: 'p', concurrency: 3 })
    expect(calls.sort()).toEqual(['a', 'c', 'd', 'e'])
    expect(out.fetched.map(j => j.id)).toEqual(['a'])
    const by = Object.fromEntries(out.settled.map(r => [r.jobId, r]))
    expect(by.g).toMatchObject({ fate: 'skip', stage: 'filter', reason: 'Function: sales' })
    expect(by.c).toMatchObject({ fate: 'skip', dupOf: 'a' })
    expect(by.d).toMatchObject({ fate: 'failed', reason: 'Job description unavailable' })
    expect(by.e?.fate).toBe('failed')
    expect(out.errors).toBe(1)
  })

  it('keeps same-text postings for different places apart, and never merges different texts', async () => {
    const jobs = [
      { id: 'blr', url: 'blr', title: 'Engineer', company: 'C', location: 'Bengaluru, India' },
      { id: 'ber', url: 'ber', title: 'Engineer', company: 'C', location: 'Berlin, Germany' },
      { id: 'blr2', url: 'blr2', title: 'Engineer', company: 'C', location: 'bengaluru india' }, // same place, spelled differently
      { id: 'n1', url: 'n1', title: 'Engineer', company: 'D', location: null },
      { id: 'n2', url: 'n2', title: 'Engineer', company: 'D', location: null }, // different JD text, no location: a separate opening
    ]
    const out = await stage0(jobs, { fetchJd: async j => (j.id === 'n2' ? 'Another team entirely' : 'Same JD text for everyone'), cache: mem(), profileKey: 'p', concurrency: 2 })
    expect(out.fetched.map(j => j.id).sort()).toEqual(['ber', 'blr', 'n1', 'n2'])
    expect(out.settled).toEqual([expect.objectContaining({ jobId: 'blr2', dupOf: 'blr' })])
  })
  it('answers from the verdict cache and respects the profile key', async () => {
    const cache = mem()
    cache.set(cacheKey(jdHash('JD one', null), 'p'), light(4.4))
    const j = [{ id: 'a', url: 'a', title: 'T', company: 'C', location: null }]
    const hit = await stage0(j, { fetchJd: async () => 'JD one', cache, profileKey: 'p', concurrency: 1 })
    expect(hit.settled[0]).toMatchObject({ fate: 'light', cached: true }); expect(hit.fetched).toEqual([])
    const miss = await stage0(j, { fetchJd: async () => 'JD one', cache, profileKey: 'other', concurrency: 1 })
    expect(miss.fetched).toHaveLength(1)
  })

  it('leaves jobs pending (not failed) when cancelled before they start', async () => {
    const ac = new AbortController(); ac.abort()
    const out = await stage0([{ id: 'a', url: 'a', title: 'T', company: 'C', location: null }], { fetchJd: async () => 'x'.repeat(50), cache: mem(), profileKey: 'p', concurrency: 1, signal: ac.signal })
    expect(out.settled).toEqual([]); expect(out.fetched).toEqual([])
  })

  it('persists the file cache', () => {
    const f = `${process.env.TMPDIR ?? '/tmp'}/evc-${Date.now()}.json`
    const c = fileCache(f); c.set('k', light(3)); c.flush()
    expect(fileCache(f).get('k')?.fit).toBe(3)
  })
})

describe('stage 1', () => {
  const c = candidate()
  it('drops by location, function, seniority, JD years, deny word and pay; passes the rest', () => {
    const jobs = [
      job('ok'),
      job('abroad', { location: 'Berlin, Germany' }),
      job('sales', { title: 'Sales Manager' }),
      job('dir', { title: 'Staff Backend Engineer' }),
      job('years', { jd: 'Java. 15+ years of experience required.' }),
      job('deny', { jd: 'Java role, onsite crypto trading' }),
      job('pay', { jd: 'Java. Salary: $50,000 - $60,000 per year' }),
    ]
    const { pass, settled } = stage1(jobs, c, { deny: ['crypto'], salaryFloor: { amount: 100_000, currency: 'USD' } })
    expect(pass.map(j => j.id)).toEqual(['ok'])
    const why = Object.fromEntries(settled.map(r => [r.jobId, r.reason]))
    expect(why.abroad).toMatch(/Location/); expect(why.sales).toMatch(/Function/); expect(why.dir).toMatch(/Seniority/)
    expect(why.years).toMatch(/15\+ years/); expect(why.deny).toMatch(/crypto/); expect(why.pay).toMatch(/below your 100000/)
  })
  it('never drops a job the user pinned as relevant', () => {
    const { pass } = stage1([job('abroad', { location: 'Berlin, Germany' })], { ...c, pinned: new Set(['abroad']) })
    expect(pass.map(j => j.id)).toEqual(['abroad'])
  })
  it('parses pay ranges only when the currency is clear', () => {
    expect(advertisedPayMax('Salary: $90k - $120k')).toEqual({ max: 120_000, currency: 'USD' })
    expect(advertisedPayMax('CTC: ₹20 - 30 LPA')?.currency).toBe('INR')
    expect(advertisedPayMax('Salary: 90 - 120')).toBeNull()
    expect(yearsAsked('3-5 years, and 8+ years leading teams')).toBe(8)
    expect(yearsAsked('founded 1999, 100 years of history')).toBeNull()
  })
})

describe('stage 2', () => {
  const c = candidate()
  it('scores overlap high for a matching JD and low for an unrelated one', () => {
    const idx = buildCvIndex(c.cv)
    const hi = localScore(job('a', { jd: 'Java, Kafka, Spring Boot, PostgreSQL. 5 years.' }), c, idx)
    const lo = localScore(job('b', { title: 'Frontend Developer', jd: 'React, Rust, GraphQL, Terraform. 5 years.' }), c, idx)
    expect(hi.score).toBeGreaterThan(80); expect(lo.score).toBeLessThan(45)
    expect(hi.matched).toContain('Java'); expect(lo.missing).toContain('Rust')
  })
  it('drops below the threshold with a reason that names the overlap', () => {
    const { pass, settled } = stage2([job('a', { jd: 'Java, Kafka. 5 years.' }), job('b', { title: 'Frontend Developer', jd: 'React, Figma, Photoshop' })], c, 40)
    expect(pass.map(j => j.id)).toEqual(['a']); expect(settled[0]!.reason).toMatch(/Low overlap/)
  })
})

describe('stage 3 parsing', () => {
  it('extracts the array from fences/chatter and ignores brackets inside strings', () => {
    expect(extractArray('Sure!\n```json\n[{"a":"x]y"}]\n```')).toEqual([{ a: 'x]y' }])
    expect(extractArray('[oops [1,2]')).toEqual([1, 2])
    expect(extractArray('no json')).toBeNull()
  })
  it('validates ids/fit, clamps, keeps decision consistent with a hard stop, drops duplicates and junk', () => {
    const text = JSON.stringify([
      { id: 'a', fit: 9, decision: 'Apply', hard_stop: 'Needs visa', archetype: 'X', summary: 's' },
      { id: 'a', fit: 1 }, { id: 'zzz', fit: 3 }, { id: 'b', fit: 'high' }, { id: 'c', fit: 3.84, strengths: ['1', '2', '3', '4'] }, 7, null,
    ])
    const out = parseBatch(text, ['a', 'b', 'c'])
    expect([...out.keys()]).toEqual(['a', 'c'])
    expect(out.get('a')).toMatchObject({ fit: 5, decision: 'Research first', hardStop: 'Needs visa' })
    expect(out.get('c')).toMatchObject({ fit: 3.8, decision: 'Consider' }); expect(out.get('c')!.strengths).toHaveLength(3)
  })
  it('picks the verdict array out of CLI log noise with other bracketed lines', () => {
    const log = '[2m12:00[0m ▸ Read [file] done\n[1, 2, 3]\n[{"id":"a","fit":4.1}]\n✓ done [ok]'
    expect([...parseBatch(log, ['a']).keys()]).toEqual(['a'])
  })
  it('excerpt keeps the head and requirement lines within the cap', () => {
    const jd = 'Title\nLoc\n' + 'filler line about our culture\n'.repeat(200) + 'Requirements: 5 years of experience with Java\n'
    const e = excerpt(jd, 400)
    expect(e.length).toBeLessThanOrEqual(400); expect(e).toContain('Title')
  })
})

describe('stage 3 batching', () => {
  const c = candidate()
  const world = synthJobs(40, 3, 0).filter(j => j.kind !== 'abroad')
  const fetched = world.map(j => ({ ...j, jdHash: jdHash(j.jd) }))
  const cfg = { ...DEFAULT_CONFIG, batchSize: 8 }
  const run = (llm: ReturnType<typeof fakeLlm>, over = {}) => stage3(fetched, c, ['Java'], llm, { ...cfg, ...over }, { cache: mem() })

  it('judges everything in ceil(n/batch) calls when the model behaves', async () => {
    const llm = fakeLlm(world)
    const out = await run(llm)
    expect(llm.calls).toBe(Math.ceil(fetched.length / 8))
    expect(out.settled.every(r => r.fate === 'light' || r.fate === 'deep')).toBe(true)
    expect(out.inputTokens).toBeGreaterThan(0)
  })
  it('splits and retries batches that come back short or malformed, losing nothing', async () => {
    const llm = fakeLlm(world, { badJsonRate: 0.2, dropRate: 0.1, throwRate: 0.05, seed: 5 })
    const out = await run(llm)
    expect(out.settled.filter(r => r.fate !== 'failed').length).toBeGreaterThanOrEqual(Math.floor(fetched.length * 0.9))
    expect(llm.calls).toBeGreaterThan(Math.ceil(fetched.length / 8))
  })
  it('marks jobs failed (not fabricated) when the model never answers', async () => {
    const out = await run(Object.assign((async () => { throw new Error('down') }) as never, { calls: 0 }))
    expect(out.settled.every(r => r.fate === 'failed' && r.light === null)).toBe(true)
    expect(out.errors).toBeGreaterThan(0)
  })
  it('escalates only high-fit jobs, capped by maxDeep, best first', async () => {
    const out = await run(fakeLlm(world, { noise: 0 }), { escalateMin: 4, maxDeep: 3 })
    const deep = out.settled.filter(r => r.fate === 'deep')
    expect(deep).toHaveLength(3)
    expect(Math.min(...deep.map(r => r.light!.fit))).toBeGreaterThanOrEqual(4)
    const lights = out.settled.filter(r => r.fate === 'light').map(r => r.light!.fit)
    expect(Math.min(...deep.map(r => r.light!.fit))).toBeGreaterThanOrEqual(Math.max(...lights))
  })
  it('keeps each request under maxPromptChars even when batchSize would allow more', async () => {
    const llm = fakeLlm(world)
    const sizes: number[] = []
    const spy = Object.assign(async (r: Parameters<typeof llm>[0]) => { sizes.push(r.user.length); return llm(r) }, { calls: 0 })
    await stage3(fetched, c, [], spy as never, { ...cfg, batchSize: 40, jdChars: 1800, maxPromptChars: 5000 }, { cache: mem() })
    expect(sizes.length).toBeGreaterThan(Math.ceil(fetched.length / 40))
    expect(Math.max(...sizes)).toBeLessThan(5000 + 2500) // chars budget + digest + per-job headers
  })
  it('stops calling the model once the budget is spent', async () => {
    const llm = Object.assign(fakeLlm(world), {})
    const priced = async (r: Parameters<typeof llm>[0]) => ({ ...(await llm(r)), usd: 0.6 })
    const out = await stage3(fetched, c, [], priced as never, { ...cfg, budgetUsd: 1, llmConcurrency: 1 }, { cache: mem() })
    expect(llm.calls).toBe(2)
    expect(out.settled.some(r => r.reason === 'Budget reached')).toBe(true)
  })
})
