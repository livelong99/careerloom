import { describe, expect, it } from 'vitest'
import { guardSuggestion } from './guard'
import type { Suggestion } from './types'

const CV = `# Asha Rao
## Experience
### Platform Engineer, Northwind (2021-2024)
- Led the Kubernetes migration of 40 services, cutting deploy time by 60%
- Built Terraform modules used by 12 teams
- Mentored 3 engineers
## Skills
Kubernetes, Terraform, Python, Go, PostgreSQL`
const STORIES = '| 1 | Kubernetes | Cluster migration | Legacy VMs were failing | Migrate 40 services | I led the cut-over | Zero downtime | x |'

const s = (over: Partial<Suggestion> = {}): Suggestion => ({ questionId: 'q', model: 'm', tier: 'fast', say: '', bullets: [], star: null, proof: [], flags: [], done: true, firstTokenMs: 1, totalMs: 2, costUsd: 0, ...over })
const src = { cv: CV, stories: STORIES, known: ['Tell me about a migration at Northwind'] }

describe('guardSuggestion', () => {
  it('passes a grounded answer with no flags', () => {
    const r = guardSuggestion(src, s({ say: 'I led the Kubernetes migration of 40 services.', bullets: ['Cut deploy time by 60%', 'Built Terraform modules used by 12 teams'] }))
    expect(r.flags).toEqual([])
  })
  it('flags an injected fake number, skill and employer but keeps the text', () => {
    const say = 'I saved $9M at Globex Industries using Rust and cut costs 75%.'
    const r = guardSuggestion(src, s({ say, bullets: ['Managed 200 engineers'] }))
    expect(r.say).toBe(say)
    const kinds = r.flags.map(f => f.kind)
    expect(kinds).toContain('unsupported-number')
    expect(r.flags.map(f => f.text).join(' ')).toMatch(/75|200/)
    expect(kinds).toContain('unsupported-skill')
    expect(kinds).toContain('unsupported-name')
  })
  it('allows numbers that only the interviewer said', () => {
    const r = guardSuggestion({ ...src, known: ['Design it for 10 million users'] }, s({ say: 'For 10 million users I would shard by tenant.' }))
    expect(r.flags.filter(f => f.kind === 'unsupported-number')).toEqual([])
  })
  it('drops proof quotes that are not verbatim in the résumé or stories, and short or duplicate ones', () => {
    const r = guardSuggestion(src, s({ proof: [
      { quote: 'Led the Kubernetes migration of 40 services', source: 'cv.md' },
      { quote: 'Led   the Kubernetes\nmigration of 40 services', source: 'dupe' },
      { quote: 'Led the Kubernetes migration of 400 services', source: 'cv.md' },
      { quote: 'Go', source: 'cv.md' },
      { quote: 'Zero downtime', source: 'story 1' },
    ] }))
    expect(r.proof.map(p => p.quote)).toEqual(['Led the Kubernetes migration of 40 services', 'Zero downtime'])
  })
  it('property: every surviving proof quote is a substring of cv + stories', () => {
    let seed = 7
    const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff
    const pool = `${CV}\n${STORIES}`.replace(/\s+/g, ' ')
    for (let i = 0; i < 300; i++) {
      const a = Math.floor(rnd() * pool.length), len = 4 + Math.floor(rnd() * 60)
      let quote = pool.slice(a, a + len)
      if (rnd() < 0.5) { const k = Math.floor(rnd() * quote.length); quote = quote.slice(0, k) + 'Z' + quote.slice(k + 1) } // corrupt half
      const out = guardSuggestion(src, s({ proof: [{ quote, source: 'x' }] }), { factCheck: false })
      for (const p of out.proof) expect(pool.includes(p.quote)).toBe(true)
    }
  })
  it('does not mutate its input', () => {
    const input = s({ say: 'I saved $9M.', proof: [{ quote: 'nope nope nope', source: 'x' }] })
    const snapshot = JSON.stringify(input)
    guardSuggestion(src, input)
    expect(JSON.stringify(input)).toBe(snapshot)
  })
  it('skips the fact check when configured off', () => {
    expect(guardSuggestion(src, s({ say: 'I saved $9M at Snowflake.' }), { factCheck: false }).flags).toEqual([])
  })
})
