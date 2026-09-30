import { describe, expect, it } from 'vitest'

import { parseCv } from './model'
import { buildCvIndex, canonicalize, extractSkills, matchSkill, stem } from './skills'

const CV = parseCv(`# Sam Doe — Engineer

sam@example.com · Pune

## Experience

### Backend Engineer — Acme (Jan 2021–Present)

- Built REST APIs in Node.js and PostgreSQL, cutting p95 latency by 40%.
- Ran CI/CD on Jenkins with Docker.

## Skills

- **Tools:** Kubernetes, Redis, Go
`)

describe('extractSkills', () => {
  it('canonicalises aliases and keeps C++/C#/.NET distinct', () => {
    const s = extractSkills('nodejs, k8s, C++ and C#, Postgres, go the extra mile, Spring Boot')
    expect([...s].sort()).toEqual(['C#', 'C++', 'Kubernetes', 'Node.js', 'PostgreSQL', 'Spring Boot'].sort())
  })
  it('counts the Go language only in its exact case', () => {
    expect(extractSkills('We go further').has('Go')).toBe(false)
    expect(extractSkills('Languages: Go, Rust').has('Go')).toBe(true)
  })
})

describe('matchSkill', () => {
  const idx = buildCvIndex(CV)
  it('exact, including alias spellings', () => {
    expect(matchSkill('Postgres', idx).kind).toBe('exact')
    expect(matchSkill('k8s', idx).kind).toBe('exact')
  })
  it('taxonomy: a sibling database earns partial credit only', () => {
    const m = matchSkill('MySQL', idx)
    expect(m).toMatchObject({ kind: 'taxonomy', weight: 0.6, via: 'PostgreSQL' })
  })
  it('stem match for out-of-vocabulary phrases', () => {
    expect(matchSkill('feature flags', buildCvIndex(parseCv('## Experience\n- Rolled out the billing change behind a feature flag')))).toMatchObject({ kind: 'stem' })
  })
  it('none when unrelated; a judged synonym lifts it to 0.8', () => {
    expect(matchSkill('Terraform', idx).kind).toBe('none')
    expect(matchSkill('Terraform', idx, 'Pulumi')).toMatchObject({ kind: 'synonym', weight: 0.8 })
  })
  it('separates bullet evidence from a skills-list mention', () => {
    expect(idx.inBullets.has('Node.js')).toBe(true)
    expect(idx.all.has('Redis') && !idx.inBullets.has('Redis')).toBe(true)
  })
})

it('helpers', () => {
  expect(stem('pipelines')).toBe(stem('pipeline'))
  expect(canonicalize('ReactJS')).toBe('React')
})
