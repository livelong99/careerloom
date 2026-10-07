// Deterministic synthetic world for tests and the benchmark: a candidate, N jobs with a ground-truth fit, and a fake
// batched model that reads the same prompt the real one would (so token counts are the real prompt sizes).
import { parseCv } from '../ats/model'
import { readProfile } from '../prescreen-core'
import type { Candidate, EvalJob, Light, LlmCall } from './types'
import { round1, sha } from './util'
import { jobLabel } from './stage3-batch'

export const CV = `# Asha Rao
asha@example.com

## Skills
Java, Spring Boot, Kafka, PostgreSQL, AWS, Docker, Kubernetes, REST

## Experience
### Senior Backend Engineer — Acme
- Built Kafka-based order pipeline in Java and Spring Boot handling 40k events per second
- Cut PostgreSQL p95 latency 60% by redesigning indexes
- Ran services on Kubernetes and AWS with Docker-based CI
`
export const PROFILE_YML = `candidate:\n  full_name: Asha Rao\nlocation:\n  city: Bengaluru\n  country: India\ntarget_roles:\n  primary:\n    - Senior Backend Engineer\n  archetypes:\n    - name: Backend Engineer\n      level: Senior\n      fit: primary\nnarrative:\n  headline: Backend engineer with 6 years of experience\n`

export function candidate(): Candidate {
  const profile = readProfile(PROFILE_YML, '', CV)
  const cv = parseCv(CV)
  return { profile, cv, policy: { countries: ['India'], remoteAnywhere: false, years: 6 }, profileKey: 'test-profile' }
}

// mulberry32: tiny seeded RNG so every run of the bench sees the same 1000 jobs.
const rng = (seed: number) => () => { seed |= 0; seed = (seed + 0x6d2b79f5) | 0; let t = Math.imul(seed ^ (seed >>> 15), 1 | seed); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296 }

const MATCH = ['Java', 'Spring Boot', 'Kafka', 'PostgreSQL', 'AWS', 'Docker', 'Kubernetes', 'REST']
const OTHER = ['Rust', 'Go', 'Scala', 'Terraform', 'GraphQL', 'Redis', 'Elasticsearch', 'React']
const KINDS = ['match', 'adjacent', 'sales', 'senior', 'abroad', 'weak'] as const
export type Kind = (typeof KINDS)[number]
export type SynthJob = EvalJob & { kind: Kind; jd: string; truth: number }

const FILLER = 'We are a fast-growing company building products used by millions of customers. You will collaborate with product and design, take ownership of services end to end, and mentor teammates. We value curiosity, clear writing and kind code review. Benefits include health cover, learning budget and flexible hours. '

export function synthJobs(n: number, seed = 7, dupRate = 0.08): SynthJob[] {
  const r = rng(seed)
  const pick = <T,>(xs: readonly T[]) => xs[Math.floor(r() * xs.length)]!
  const out: SynthJob[] = []
  for (let i = 0; i < n; i++) {
    if (out.length && r() < dupRate) { const d = pick(out); out.push({ ...d, id: `https://jobs.example.com/${i}`, url: `https://jobs.example.com/${i}` }); continue }
    const kind = pick(KINDS)
    const skills = kind === 'match' ? [...MATCH].sort(() => r() - 0.5).slice(0, 5) : kind === 'adjacent' ? [...MATCH.slice(0, 1 + Math.floor(r() * 4)), ...OTHER.slice(0, 2 + Math.floor(r() * 3))] : kind === 'weak' ? OTHER.slice(0, 5) : [...MATCH].slice(0, 2)
    const title = { match: 'Senior Backend Engineer', adjacent: 'Software Engineer, Platform', sales: 'Sales Manager', senior: 'Director of Engineering', abroad: 'Senior Backend Engineer', weak: 'Frontend Developer' }[kind]
    const location = kind === 'abroad' ? 'Berlin, Germany' : pick(['Bengaluru, India', 'Pune, India', 'Hyderabad, India'])
    const years = kind === 'senior' ? 15 : 4 + Math.floor(r() * 3)
    const company = `Co${Math.floor(r() * 400)}`
    const jd = `${title} at ${company}\n${location}\n${FILLER.repeat(2 + Math.floor(r() * 5))}\nRequirements:\n- ${years}+ years of experience\n${skills.map(s => `- Hands-on ${s}`).join('\n')}\nResponsibilities:\n- Own services end to end\n${FILLER.repeat(3)}`
    const overlap = skills.filter(s => MATCH.includes(s)).length / skills.length
    const truth = kind === 'match' ? 4.2 + 0.7 * r() : kind === 'adjacent' ? 2.6 + 1.8 * overlap : kind === 'weak' ? 1.5 + r() : 1 + r()
    out.push({ id: `https://jobs.example.com/${i}`, url: `https://jobs.example.com/${i}`, title: `${title}`, company, location, kind, jd, truth: round1(Math.min(5, truth)) })
  }
  return out
}

export type FakeLlmOpts = { noise?: number; badJsonRate?: number; dropRate?: number; throwRate?: number; seed?: number; model?: string }
/** Reads "### <id>" blocks from the real prompt; answers with truth + noise, optionally malformed/short/throwing. */
export function fakeLlm(world: SynthJob[], o: FakeLlmOpts = {}): LlmCall & { calls: number } {
  const truth = new Map(world.map(j => [jobLabel(j.id), j.truth]))
  const r = rng(o.seed ?? 11)
  const fn = (async ({ system, user }) => {
    fn.calls++
    if (r() < (o.throwRate ?? 0)) throw new Error('simulated provider error')
    const ids = [...user.matchAll(/^### (\S+)$/gm)].map(m => m[1]!)
    if (r() < (o.badJsonRate ?? 0)) return { text: 'Sorry, here are my thoughts: [{"id": ', inputTokens: Math.ceil((system.length + user.length) / 4), outputTokens: 20, model: o.model ?? 'fake/cheap' }
    const items = ids.filter(() => r() >= (o.dropRate ?? 0)).map(id => {
      const fit = round1(Math.min(5, Math.max(0, (truth.get(id) ?? 2) + (r() - 0.5) * 2 * (o.noise ?? 0.3))))
      return { id, fit, decision: fit >= 4.2 ? 'Apply' : fit >= 3.5 ? 'Consider' : 'Skip', archetype: 'Backend', summary: `Role ${sha(id, 4)}`, strengths: ['Java'], gaps: [], hard_stop: null }
    })
    const text = '```json\n' + JSON.stringify(items) + '\n```'
    return { text, inputTokens: Math.ceil((system.length + user.length) / 4), outputTokens: Math.ceil(text.length / 4), model: o.model ?? 'fake/cheap' }
  }) as LlmCall & { calls: number }
  fn.calls = 0
  return fn
}

export const fakeFetch = (world: SynthJob[]) => { const m = new Map(world.map(j => [j.id, j.jd])); return async (j: EvalJob) => m.get(j.id) ?? '' }
export type { Light }
