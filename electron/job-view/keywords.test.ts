import { describe, expect, it } from 'vitest'

import { keywordCoverage } from './keywords'

const CV = '## Experience\n- Ran Kubernetes clusters on AWS and wrote Python services.\n- Provided mentorship to two engineers.'

describe('keywordCoverage', () => {
  const k = keywordCoverage(['Kubernetes', 'kubernetes', 'Terraform', 'Docker', 'Mentoring', 'Rust'], CV)
  it('dedupes case-insensitively and ranks covered/related/missing', () => {
    const by = Object.fromEntries(k.map(x => [x.keyword, x.status]))
    expect(k.filter(x => x.keyword.toLowerCase() === 'kubernetes')).toHaveLength(1)
    expect(by.Kubernetes).toBe('covered')
    expect(by.Mentoring).toBe('covered')
    expect(by.Rust).toBe('missing')
    expect(by.Terraform).toBe('missing')
  })
  it('marks same-family skills as related, naming the one you have', () => {
    const d = k.find(x => x.keyword === 'Docker')!
    expect(d.status).toBe('related')
    expect(d.via).toBeTruthy()
  })
  it('handles an empty résumé', () => {
    expect(keywordCoverage(['Go'], '').every(x => x.status === 'missing')).toBe(true)
  })
})
