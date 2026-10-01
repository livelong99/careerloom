// @vitest-environment node
import { describe, expect, it } from 'vitest'

import { attribution, classifyHost, isNeverFetch } from './sources'

describe('never-fetch list', () => {
  it.each([
    'https://www.linkedin.com/jobs/1', 'https://uk.linkedin.com/x', 'https://indeed.com/q', 'https://in.indeed.com/q', 'https://www.indeed.co.in/q',
    'https://www.glassdoor.com/Interview', 'https://www.glassdoor.co.in/x', 'https://www.teamblind.com/post', 'https://leetcode.com/discuss/1',
    'https://www.reddit.com/r/x', 'https://old.reddit.com/r/x', 'https://medium.com/@a/b', 'https://foo.medium.com/b', 'https://LinkedIn.com./x',
  ])('denies %s', url => {
    const c = classifyHost(url)
    expect(c.allowed).toBe(false)
    expect(c.reason).toBe('never-fetch host')
  })
  it('does not deny look-alikes', () => {
    for (const h of ['notlinkedin.com', 'redditor.example.com', 'mediumrare.com', 'indeedfoo.com']) expect(isNeverFetch(h)).toBe(false)
  })
})

describe('allowed hosts', () => {
  it('tiers, kinds and licences', () => {
    expect(classifyHost('https://stackoverflow.com/q/1')).toMatchObject({ allowed: true, kind: 'qa-site', group: 'stackexchange', licence: 'CC BY-SA 4.0' })
    expect(classifyHost('https://github.com/h5bp/x')).toMatchObject({ kind: 'github', group: 'github' })
    expect(classifyHost('https://www.onetonline.org/x')).toMatchObject({ group: 'taxonomy', licence: 'CC BY 4.0', trust: 2 })
    expect(classifyHost('https://news.ycombinator.com/item?id=1')).toMatchObject({ kind: 'forum', group: 'hn' })
    expect(classifyHost('https://careers.acme-corp.com/x', 'Acme Corp')).toMatchObject({ kind: 'company-page', group: 'companyPages' })
    expect(classifyHost('https://engineering.example.com/post')).toMatchObject({ kind: 'eng-blog' })
    expect(classifyHost('https://random.example.org/p')).toMatchObject({ allowed: true, kind: 'other', trust: 0 })
  })
  it('rejects non-URLs', () => { expect(classifyHost('nope').allowed).toBe(false) })
})

describe('attribution', () => {
  it('renders licence strings (snapshot)', () => {
    expect(attribution('CC BY-SA 4.0', 'How do closures work?', 'https://stackoverflow.com/q/1')).toMatchInlineSnapshot(`"Adapted from “How do closures work?” (https://stackoverflow.com/q/1), licensed CC BY-SA 4.0. Our summary is a changed version."`)
    expect(attribution('CC BY 4.0', 'O*NET', 'https://www.onetonline.org/')).toContain('CC BY 4.0')
    expect(attribution(null, '', 'https://x.example/p')).toBe('Summarised from “https://x.example/p” (https://x.example/p).')
  })
})
