import { describe, expect, it } from 'vitest'

import { coverHtml } from './coverHtml'

describe('coverHtml', () => {
  it('escapes everything it prints', () => {
    const h = coverHtml({ name: 'A <b>', contact: ['a@b.c', ''], date: '1 Oct 2026', company: 'X & Y', role: '"Eng"' }, ['Line <script>alert(1)</script>'])
    expect(h).not.toContain('<script>')
    expect(h).toContain('X &amp; Y')
    expect(h).toContain('&lt;script&gt;')
    expect(h).toContain('a@b.c')
  })
})
