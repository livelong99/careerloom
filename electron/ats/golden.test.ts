import { describe, expect, it } from 'vitest'

import { SAMPLE_CV } from './fixtures'
import labelled from './golden/labelled.json'
import type { JdReq } from './llm'
import { scoreMatch } from './match'
import { parseCv } from './model'

const MIN_LABELLED = 30
const NOW = Date.UTC(2026, 8, 1)
const mk = (skills: string[], requiredCount = skills.length): JdReq[] => skills.map((s, i) => ({ id: `r${i}`, text: s, skill: s, required: i < requiredCount }))
const JD_TEXT = 'We are hiring a backend engineer to own services end to end, with 5+ years of experience. '.repeat(12)

// Synthetic set: the résumé above against JDs designed from near-perfect (5) to unrelated (1).
const SYNTHETIC: Array<{ id: string; relevance: number; reqs: JdReq[] }> = [
  { id: 'same-stack', relevance: 5, reqs: mk(['Node.js', 'PostgreSQL', 'Kubernetes', 'Redis', 'Docker']) },
  { id: 'same-stack-extra-pref', relevance: 5, reqs: mk(['Node.js', 'PostgreSQL', 'Docker', 'Terraform', 'Jenkins'], 3) },
  { id: 'adjacent-db', relevance: 4, reqs: mk(['Node.js', 'MySQL', 'Kubernetes', 'Redis']) },
  { id: 'one-gap', relevance: 4, reqs: mk(['Node.js', 'PostgreSQL', 'Kafka', 'Docker']) },
  { id: 'half-match', relevance: 3, reqs: mk(['Node.js', 'Kafka', 'Elasticsearch', 'Docker']) },
  { id: 'different-lang', relevance: 2, reqs: mk(['Java', 'Spring Boot', 'Oracle', 'Kafka']) },
  { id: 'data-science', relevance: 1, reqs: mk(['PyTorch', 'TensorFlow', 'Pandas', 'Spark']) },
  { id: 'marketing-tools', relevance: 1, reqs: mk(['HubSpot', 'Marketo', 'SEO', 'Tableau']) },
]

function ranks(xs: number[]): number[] {
  const order = xs.map((v, i) => [v, i] as const).sort((a, b) => a[0] - b[0])
  const out = new Array<number>(xs.length)
  for (let i = 0; i < order.length;) {
    let j = i
    while (j + 1 < order.length && order[j + 1]![0] === order[i]![0]) j++
    for (let k = i; k <= j; k++) out[order[k]![1]] = (i + j) / 2 + 1
    i = j + 1
  }
  return out
}
export function spearman(a: number[], b: number[]): number {
  const ra = ranks(a), rb = ranks(b)
  const mean = (x: number[]) => x.reduce((s, v) => s + v, 0) / x.length
  const ma = mean(ra), mb = mean(rb)
  const cov = ra.reduce((s, v, i) => s + (v - ma) * (rb[i]! - mb), 0)
  return cov / Math.sqrt(ra.reduce((s, v) => s + (v - ma) ** 2, 0) * rb.reduce((s, v) => s + (v - mb) ** 2, 0))
}

describe('synthetic golden set (sanity only: this is NOT a calibration)', () => {
  const cv = parseCv(SAMPLE_CV)
  const scores = SYNTHETIC.map(s => scoreMatch({ cv, reqs: s.reqs, similarities: null, jdText: JD_TEXT, now: NOW }).score)
  it('scores follow the designed relevance (Spearman >= 0.8)', () => {
    expect(spearman(scores, SYNTHETIC.map(s => s.relevance))).toBeGreaterThanOrEqual(0.8)
  })
  it('the unrelated JDs score far below the near-perfect ones', () => {
    const by = Object.fromEntries(SYNTHETIC.map((s, i) => [s.id, scores[i]!]))
    expect(by['same-stack']! - by['data-science']!).toBeGreaterThan(30)
    expect(by['same-stack']).toBeLessThan(100)
  })
})

describe('human-labelled golden set', () => {
  const pairs = labelled.pairs as Array<{ cv: string; jd: { reqs: JdReq[]; text: string }; label: number }>
  const ready = pairs.length >= MIN_LABELLED
  // Skips with a clear reason until enough real labels exist; the UI keeps calling the score a "parse-risk heuristic".
  it.skipIf(!ready)(`Spearman >= 0.6 against ${MIN_LABELLED}+ labelled pairs (${pairs.length} so far: add pairs to golden/labelled.json)`, () => {
    const got = pairs.map(p => scoreMatch({ cv: parseCv(p.cv), reqs: p.jd.reqs, similarities: null, jdText: p.jd.text, now: NOW }).score)
    expect(spearman(got, pairs.map(p => p.label))).toBeGreaterThanOrEqual(0.6)
  })
})
