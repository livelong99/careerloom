import { describe, expect, it } from 'vitest'

import { SAMPLE_CV } from './ats/fixtures'
import { profileFromCv, profileToPayload, rebuildProfile, validateProfile } from './resume-profile'

const CV = `${SAMPLE_CV}
## Awards

- Dell Game Changer Award for critical contributions to the Excellence Program.
- 1st place at a national hackathon in 2020.

## Certifications

- AWS Solutions Architect Associate
`

describe('profileFromCv (content the template used to drop)', () => {
  const p = profileFromCv(CV)!
  it('reads contact details from the contact line', () => {
    expect(p).toMatchObject({ email: 'sam.doe@example.com', phone: '+1 415 555 0134', location: 'Pune, India' })
    expect(p.links).toEqual([{ kind: 'linkedin', url: 'https://linkedin.com/in/samdoe' }])
  })
  it('keeps awards, certifications and grouped skills', () => {
    expect(p.awards).toHaveLength(2)
    expect(p.certifications).toEqual(['AWS Solutions Architect Associate'])
    expect(p.skillGroups?.map(g => g.category)).toEqual(['Languages', 'Tools'])
    expect(p.skills).toContain('Kubernetes')
  })
  it('splits "Degree — School (dates)" education and link-wrapped project names', () => {
    expect(p.education[0]).toMatchObject({ degree: 'B.Tech in Computer Engineering', school: 'Manipal University', start: 'July 2015', end: 'May 2019' })
    expect(p.projects[0]!.name).toBe('Ledger')
  })
  it('the payload now carries them to the template', () => {
    const out = profileToPayload(p, 'a4')
    expect(out.awards).toHaveLength(2)
    expect(out.certifications).toEqual([{ title: 'AWS Solutions Architect Associate' }])
    expect(out.skills[0]).toMatchObject({ category: 'Languages' })
  })
})

describe('rebuildProfile', () => {
  it('uses cv.md content but keeps old contact details cv.md lacks', () => {
    const existing = validateProfile({ name: 'Sam', email: 'old@example.com', phone: '111', location: 'Elsewhere', links: [{ kind: 'github', url: 'https://github.com/sam' }], extractedFrom: 'documents/cv/sam.pdf', skills: [] })!
    const md = CV.replace(/sam\.doe@example\.com · \+1 415 555 0134 · Pune, India · \[LinkedIn\]\([^)]*\)/, 'no contact here')
    const r = rebuildProfile(md, existing, 5)!
    expect(r).toMatchObject({ email: 'old@example.com', phone: '111', location: 'Elsewhere', extractedFrom: 'documents/cv/sam.pdf', extractedAt: 5 })
    expect(r.links).toEqual(existing.links)
    expect(r.awards).toHaveLength(2)
  })
  it('null without a heading', () => expect(rebuildProfile('nothing', null)).toBeNull())
})

it('validateProfile round-trips the new optional fields', () => {
  const p = validateProfile({ name: 'A', awards: ['x', 3], certifications: ['c'], skillGroups: [{ category: 'Lang', items: ['Go'] }, { category: '', items: [] }] })!
  expect(p.awards).toEqual(['x'])
  expect(p.skillGroups).toEqual([{ category: 'Lang', items: ['Go'] }])
})
