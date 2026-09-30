import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it, vi } from 'vitest'

import { REPORT } from './fixtures'
import { deterministicPosting, structurePosting, validatePosting, type ModelCall } from './jdStructure'
import { parseReport } from './reportParse'

const JD = parseReport(REPORT).jd!
const META = { title: 'Senior Platform Engineer', company: 'Acme Corp', location: null }

describe('deterministicPosting', () => {
  it('splits headed blocks into fields', () => {
    const p = deterministicPosting(JD, META)
    expect(p.summary).toBe('Build the internal platform.')
    expect(p.responsibilities).toEqual(['Run Kubernetes clusters', 'Improve CI/CD'])
    expect(p.requirements.required).toEqual(['5+ years of experience', 'Terraform'])
    expect(p.techStack).toEqual(expect.arrayContaining(['Kubernetes', 'Terraform']))
  })
  it('reads salary and work mode by regex', () => {
    const p = deterministicPosting('## Pay\nBase salary $120,000 - $150,000 USD per year. This is a fully remote, full-time role.', META)
    expect(p.salary).toMatchObject({ min: 120000, max: 150000, currency: 'USD', period: 'year' })
    expect(p.workMode).toBe('remote')
    expect(p.employmentType).toBe('Full-time')
  })
  it('handles empty input', () => { expect(deterministicPosting('', META).responsibilities).toEqual([]) })
})

describe('validatePosting', () => {
  it('keeps what is typed right and nulls the rest', () => {
    const p = validatePosting({ location: 'Berlin', workMode: 'nonsense', benefits: ['a', 3, ''], salary: { min: '1' } })
    expect(p.location).toBe('Berlin')
    expect(p.workMode).toBeNull()
    expect(p.benefits).toEqual(['a'])
    expect(p.salary?.min).toBeNull()
  })
})

describe('structurePosting', () => {
  const dir = () => mkdtempSync(join(tmpdir(), 'jv-'))
  const ok: ModelCall = async () => ({ text: '{"benefits":["Health cover"],"aboutCompany":"Acme builds tools.","seniority":"Senior"}', tokens: 321, model: 'haiku' })

  it('fills only gaps, records model + tokens, and caches by content', async () => {
    const run = vi.fn(ok)
    const cacheDir = dir()
    const a = await structurePosting(JD, META, { run, cacheDir, now: () => 1 })
    expect(a.posting.benefits).toEqual(['Health cover'])
    expect(a.posting.responsibilities).toEqual(['Run Kubernetes clusters', 'Improve CI/CD'])
    expect(a.meta).toMatchObject({ filled: 'model', model: 'haiku', tokens: 321 })
    const b = await structurePosting(JD, META, { run, cacheDir, now: () => 2 })
    expect(run).toHaveBeenCalledTimes(1)
    expect(b.posting).toEqual(a.posting)
  })
  it('truncates the model input', async () => {
    const run = vi.fn(ok)
    await structurePosting('x'.repeat(50_000), META, { run, cacheDir: dir(), now: () => 1 })
    expect(run.mock.calls[0]![0].length).toBeLessThan(12_000)
  })
  it('repairs once, then falls back to the deterministic result', async () => {
    const run = vi.fn<ModelCall>(async () => ({ text: 'not json', tokens: 5, model: 'm' }))
    const r = await structurePosting(JD, META, { run, cacheDir: dir(), now: () => 1 })
    expect(run).toHaveBeenCalledTimes(2)
    expect(r.meta.filled).toBe('model-failed')
    expect(r.posting.responsibilities).toHaveLength(2)
  })
  it('falls back when the model call throws or is unavailable', async () => {
    const r = await structurePosting(JD, META, { run: async () => { throw new Error('no runner') }, cacheDir: dir(), now: () => 1 })
    expect(r.meta.filled).toBe('model-failed')
  })
  it('skips the model when nothing is missing', async () => {
    const run = vi.fn(ok)
    const full = `## About the role\nWe build.\n## Responsibilities\n- a\n## Requirements\n- b\n## Nice to have\n- c\n## Benefits\n- d\n## About Acme\nWe are Acme.\nRemote, full-time, senior. Stack: Kubernetes. Salary $100,000 - $120,000 a year. Location: Berlin`
    const r = await structurePosting(full, { ...META, location: 'Berlin' }, { run, cacheDir: dir(), now: () => 1 })
    expect(run).not.toHaveBeenCalled()
    expect(r.meta.filled).toBe('deterministic')
  })
})
