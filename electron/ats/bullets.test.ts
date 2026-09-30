import { describe, expect, it } from 'vitest'

import { bulletQuality, judgeBullet } from './bullets'
import { readExtraction, stripScores } from './llm'

const b = (text: string, line = 1) => ({ text, section: 'Experience', entry: 'Eng', line, evidence: true })

describe('judgeBullet', () => {
  it('rewards verb + number + specificity + length', () => {
    const v = judgeBullet(b('Reduced p95 latency by 40% across 12 Node.js services by adding Redis caching and connection pooling'))
    expect(v).toMatchObject({ verb: true, quantified: true, specific: true, lengthOk: true, points: 1 })
  })
  it('flags weak, vague, short bullets', () => {
    const v = judgeBullet(b('Responsible for various tasks'))
    expect(v.verb).toBe(false)
    expect(v.issues.length).toBeGreaterThanOrEqual(3)
    expect(v.points).toBeLessThan(0.3)
  })
  it('a specificity note counts only when its quote is in the bullet', () => {
    const bullet = b('Improved our release process for the platform team every single quarter')
    expect(judgeBullet(bullet, [{ line: 1, specific: true, quote: 'not in the bullet' }]).specific).toBe(false)
    expect(judgeBullet(bullet, [{ line: 1, specific: true, quote: 'release process' }]).specific).toBe(true)
  })
})

it('bulletQuality dedupes repeated bullets and ignores non-evidence', () => {
  const good = b('Reduced p95 latency by 40% across 12 Node.js services by adding Redis caching and connection pooling', 1)
  const q = bulletQuality([good, { ...good, line: 2 }, { ...good, line: 3, evidence: false, text: 'x' }])
  expect(q.verdicts).toHaveLength(1)
  expect(q.got).toBe(15)
})

describe('llm output', () => {
  it('strips score-like fields at any depth', () => {
    const out = stripScores({ score: 99, jd: { requirements: [{ skill: 'Go', score: 5 }] }, findings: [{ title: 't', match_score: 1 }], keep: 1 })
    expect(JSON.stringify(out)).not.toMatch(/score/)
    expect(out.keep).toBe(1)
  })
  it('readExtraction drops junk and never carries a score', () => {
    const r = readExtraction({ score: 100, jd: { requirements: [{ id: 'a', skill: 'Kafka', required: true, score: 9 }, { text: 'no skill' }] }, judgements: [{ req_id: 'a', match: 'synonym', cv_quote: 'Pulsar', certain: false }, { req_id: 'z', match: 'bogus' }] })
    expect(r.reqs).toEqual([{ id: 'a', text: 'Kafka', skill: 'Kafka', required: true, years: undefined }])
    expect(r.judgements).toHaveLength(1)
    expect(JSON.stringify(r)).not.toMatch(/"score"/)
  })
})
