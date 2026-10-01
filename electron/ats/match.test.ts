import { describe, expect, it } from 'vitest'

import { scoreMatch } from './match'
import type { JdReq } from './llm'
import { parseCv } from './model'

const cv = (extra = '') => parseCv(`# Sam Doe — Engineer

sam@example.com · Pune

## Experience

### Backend Engineer — Acme (Jan 2018–Present)

- Reduced p95 latency by 40% across 12 Node.js services by adding Redis caching and connection pooling
- Migrated 30 services to Kubernetes with Docker and Jenkins, cutting deploy time from 40 to 8 minutes
- Built PostgreSQL reporting pipelines processing 2 million records nightly for the finance team
${extra}
## Skills

- **Tools:** Node.js, Redis, Kubernetes, Docker, PostgreSQL, Jenkins, Terraform
`)

const req = (id: string, skill: string, required = true): JdReq => ({ id, text: skill, skill, required })
const REQS = [req('1', 'Node.js'), req('2', 'Kubernetes'), req('3', 'PostgreSQL'), req('4', 'Redis', false)]
const JD = 'We need a backend engineer with 5+ years. '.repeat(20)
const sims = (v: number) => Object.fromEntries(REQS.map(r => [r.id, v]))
const run = (c = cv(), reqs = REQS, s: Record<string, number> | null = sims(0.88)) => scoreMatch({ cv: c, reqs, similarities: s, jdText: JD, now: Date.UTC(2026, 8, 1) })

describe('scoreMatch', () => {
  it('is bounded, never 100, and explains every part', () => {
    const r = run()
    expect(r.score).toBeLessThan(100)
    expect(r.parts.map(p => p.id)).toEqual(['coverage', 'semantic', 'seniority', 'evidence', 'bullets'])
    expect(r.low).toBeLessThanOrEqual(r.score)
    expect(r.high).toBeGreaterThanOrEqual(r.score)
  })
  it('perturbation: stripping skills lowers the score', () => {
    const stripped = parseCv(cv().markdown.replace(/Node\.js|Kubernetes|PostgreSQL|Redis/g, 'tooling'))
    expect(run(stripped).score).toBeLessThan(run().score - 10)
  })
  it('a missing required skill caps at 79; more than 3 caps at 59', () => {
    const one = run(cv(), [...REQS, req('9', 'Haskell')])
    expect(one.score).toBeLessThanOrEqual(79)
    expect(one.caps.some(c => c.id === 'missing-required')).toBe(true)
    const many = run(cv(), ['Haskell', 'Erlang', 'Elixir', 'OCaml'].map((s, i) => req(`m${i}`, s)))
    expect(many.score).toBeLessThanOrEqual(59)
  })
  it('keyword stuffing the Skills list or a dump bullet does not raise evidence depth', () => {
    const base = run(cv(), [...REQS, req('5', 'Kafka'), req('6', 'Terraform')])
    const stuffed = cv('- Used Kafka, Terraform, Ansible, Helm, Grafana, Datadog and Splunk daily\n').markdown.replace('## Skills', '## Skills\n\n- Kafka, Terraform, Ansible\n')
    const after = run(parseCv(stuffed), [...REQS, req('5', 'Kafka'), req('6', 'Terraform')])
    const evidence = (x: typeof base) => x.parts.find(p => p.id === 'evidence')!.got
    // Stuffing adds list-only credit (40%), never bullet-level credit.
    const kafka = after.perReq.find(r => r.req.id === '5')!
    expect(kafka.depth).toBe('list')
    expect(evidence(after) - evidence(base)).toBeLessThan(2.5)
  })
  it('degraded mode drops the semantic part, renormalises and lowers confidence', () => {
    const full = run()
    const deg = run(cv(), REQS, null)
    expect(deg.degraded.embeddings).toBe(true)
    expect(deg.parts.some(p => p.id === 'semantic')).toBe(false)
    expect(deg.score).toBeGreaterThan(0)
    expect(['low', 'medium']).toContain(deg.confidence)
    expect(full.confidence === 'high' || full.confidence === 'medium').toBe(true)
  })
  it('a synonym claim without a real quote is ignored; with one it earns 0.8', () => {
    const c = cv()
    const fake = scoreMatch({ cv: c, reqs: [req('t', 'Pulumi')], judgements: [{ req_id: 't', match: 'synonym', cv_quote: 'made up', certain: true }], similarities: null, jdText: JD })
    expect(fake.perReq[0]!.match.kind).not.toBe('synonym')
    const real = scoreMatch({ cv: c, reqs: [req('t', 'Pulumi')], judgements: [{ req_id: 't', match: 'synonym', cv_quote: 'Terraform', certain: false }], similarities: null, jdText: JD })
    expect(real.perReq[0]).toMatchObject({ uncertain: true })
    expect(real.perReq[0]!.match).toMatchObject({ kind: 'synonym', weight: 0.8 })
    expect(real.high).toBeGreaterThan(real.low)
  })
  it('seniority: far too junior scores lower than a fit', () => {
    const junior = scoreMatch({ cv: parseCv(cv().markdown.replace('Jan 2018', 'Jan 2025')), reqs: REQS, similarities: sims(0.88), jdText: JD, now: Date.UTC(2026, 8, 1) })
    expect(junior.parts.find(p => p.id === 'seniority')!.got).toBeLessThan(run().parts.find(p => p.id === 'seniority')!.got)
  })
})
