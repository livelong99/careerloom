// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { buildPlan, inputHashOf, privacyFilter, skillNodes } from './plan'
import { CV, JOB } from './fixtures/job'

const base = { ...JOB, depth: 'standard' as const, backend: 'brave' as const }

describe('privacyFilter', () => {
  it('rejects emails, phone numbers, the user name and ≥ 6-word cv spans', () => {
    expect(privacyFilter('contact priya.raghunathan@example.com interview', CV)).toBe(false)
    expect(privacyFilter('call +91 98765 43210 about react', CV)).toBe(false)
    expect(privacyFilter('priya raghunathan react interview', CV, 'Priya Raghunathan')).toBe(false)
    expect(privacyFilter('migration of the checkout surface from a legacy jQuery bundle', CV)).toBe(false)
  })
  it('allows role, company and skill queries, and 5-word overlaps', () => {
    expect(privacyFilter('React interview questions', CV)).toBe(true)
    expect(privacyFilter('Acme Corp Senior Frontend Engineer interview process', CV)).toBe(true)
    expect(privacyFilter('migration of the checkout surface', CV)).toBe(true)
  })
})

describe('buildPlan', () => {
  it('builds queries from the posting only, in depth-capped numbers', () => {
    const p = buildPlan(base)
    expect(p.queries.length).toBeGreaterThanOrEqual(12)
    expect(p.queries.length).toBeLessThanOrEqual(18)
    expect(p.queries).toContain('Acme Corp interview process')
    expect(p.queries).toContain('React interview questions')
    expect(new Set(p.queries.map(q => q.toLowerCase())).size).toBe(p.queries.length)
    expect(buildPlan({ ...base, depth: 'quick' }).queries.length).toBeLessThanOrEqual(8)
    expect(buildPlan({ ...base, depth: 'deep' }).queries.length).toBeGreaterThan(p.queries.length - 1)
  })
  it('ranks skills: gaps boosted, inCv from the cv, seniority raises expected level', () => {
    const nodes = skillNodes(base)
    const gql = nodes.find(n => n.id === 'graphql')!
    expect(gql).toMatchObject({ origin: 'gap', inCv: false })
    expect(nodes.find(n => n.id === 'react')!.inCv).toBe(true)
    expect(nodes.map(n => n.weight)).toEqual([...nodes.map(n => n.weight)].sort((a, b) => b - a))
    expect(nodes[0]!.expected).toBe('expert')
    expect(skillNodes({ ...base, seniority: 'Junior' })[0]!.expected).toBe('strong')
  })

  // seeded property test: 200 generated plans over a PII-heavy cv; no query may carry any of it
  it('property: 200 polluted plans never leak cv spans, emails, phones or the name', () => {
    let seed = 42
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296 }
    const cvLines = CV.split('\n')
    const polluted = [
      'priya.raghunathan@example.com', '+91 98765 43210', 'Priya Raghunathan', 'Led the migration of the checkout surface from a legacy jQuery bundle',
      'Mentored five junior engineers and ran weekly design reviews', 'React', 'Kubernetes', 'Go', 'Leadership',
    ]
    for (let n = 0; n < 200; n++) {
      const pick = () => polluted[Math.floor(rnd() * polluted.length)]!
      const plan = buildPlan({
        ...base, title: rnd() < 0.3 ? pick() : 'Platform Engineer', company: rnd() < 0.3 ? pick() : 'Globex',
        techStack: [pick(), pick(), 'TypeScript'], skills: [pick(), cvLines[Math.floor(rnd() * cvLines.length)]!.slice(0, 38)], depth: (['quick', 'standard', 'deep'] as const)[n % 3]!,
      })
      for (const q of plan.queries) {
        expect(privacyFilter(q, CV, 'Priya Raghunathan'), q).toBe(true)
        expect(q).not.toMatch(/@|\+91|98765|Raghunathan|Priya/i)
      }
    }
  })
  it('inputHashOf changes with the posting, gaps, role or company', () => {
    const a = inputHashOf({ jd: { a: 1 }, gaps: ['x'], role: 'r', company: 'c' })
    expect(a).toBe(inputHashOf({ jd: { a: 1 }, gaps: ['x'], role: 'r', company: 'c' }))
    for (const b of [{ jd: { a: 2 }, gaps: ['x'], role: 'r', company: 'c' }, { jd: { a: 1 }, gaps: [], role: 'r', company: 'c' }, { jd: { a: 1 }, gaps: ['x'], role: 'q', company: 'c' }, { jd: { a: 1 }, gaps: ['x'], role: 'r', company: 'd' }]) expect(inputHashOf(b)).not.toBe(a)
  })
})
