import { describe, expect, it } from 'vitest'
import { createRedactor, redact } from './redact'

describe('redact', () => {
  it('masks emails and phone numbers', () => {
    expect(redact('mail me at jane.doe+x@corp.co.uk or call +1 (415) 555-0134')).toBe('mail me at [EMAIL] or call [PHONE]')
    expect(redact('call 98765 43210')).toBe('call [PHONE]')
  })
  it('keeps short numbers and years', () => {
    expect(redact('I spent 3 to 5 years, since 2019, on 40% growth')).toBe('I spent 3 to 5 years, since 2019, on 40% growth')
  })
  it('masks self-introductions and titled names', () => {
    expect(redact("Hi, I'm Priya Nair and this is Dr. Rao")).toBe('Hi, I\'m [NAME] and this is [NAME]')
  })
  it('masks explicitly known names case-insensitively', () => {
    expect(createRedactor(['Priya', 'Acme Corp'])('priya works at Acme Corp')).toBe('[NAME] works at [NAME]')
  })
  it('does not treat ordinary capitalised words as names', () => {
    expect(redact('Tell me about Kubernetes at Google')).toBe('Tell me about Kubernetes at Google')
  })
})
