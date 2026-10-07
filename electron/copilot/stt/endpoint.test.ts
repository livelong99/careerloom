import { describe, expect, it } from 'vitest'

import { earlyEndMs, endsTurn, holdExtraMs, isSentenceFinal, normFinal, TRAILING_EXTRA_MS } from './endpoint'

describe('endpoint helpers', () => {
  it('recognises finished sentences and rejects mid-clause text, ellipses and abbreviations', () => {
    for (const t of ['Tell me about yourself.', 'Why do you want to work here?', 'Walk me through it!', 'He said "stop."', 'Is that right?)']) expect(isSentenceFinal(t)).toBe(true)
    for (const t of ['so tell me about', 'Why do you want', 'for example e.g.', 'well...', 'and then…', '']) expect(isSentenceFinal(t)).toBe(false)
  })
  it('a "?" or a short prompt ends a turn; a statement or a long imperative does not', () => {
    for (const t of ['Why do you want to work here?', 'Tell me about yourself.', 'So, walk me through your resume.']) expect(endsTurn(t)).toBe(true)
    for (const t of ['We had an outage last quarter.', 'Imagine you are building a notification service for fifty million users.', 'Tell me about a time you disagreed with a manager on a very important project at work.', 'so tell me about', 'Tell me about a time you led a migration and.', 'Tell me about the.', '']) expect(endsTurn(t)).toBe(false)
  })
  it('early window is a third of the wait, kept within 160-250 ms', () => {
    expect(earlyEndMs(650)).toBe(227)
    expect(earlyEndMs(200)).toBe(160)
    expect(earlyEndMs(3000)).toBe(250)
  })
  it('normalises for duplicate checks', () => {
    expect(normFinal('Tell me, about yourself.')).toBe(normFinal('tell me about yourself'))
  })
})

describe('punctuated cut-offs', () => {
  it('hold the long wait after a stop that follows a dangling word', () => {
    expect(holdExtraMs('Tell me about a time you led a migration and.')).toBe(TRAILING_EXTRA_MS)
    expect(holdExtraMs('We had an outage last quarter.')).toBeLessThan(TRAILING_EXTRA_MS)
  })
})
