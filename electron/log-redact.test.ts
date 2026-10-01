import { describe, expect, it } from 'vitest'

import { REDACTED_LINE, redactLog } from './log-redact'

describe('redactLog', () => {
  it('replaces credential-looking lines but keeps the line count', () => {
    const out = redactLog('start\nAuthorization: Bearer sk-or-SENTINEL123\nplain\napi_key=sk-SENTINEL456\nend')
    expect(out.split('\n')).toHaveLength(5)
    expect(out).not.toMatch(/SENTINEL/)
    expect(out.split('\n')[1]).toBe(REDACTED_LINE)
    expect(out.split('\n')[2]).toBe('plain')
  })
  it('masks bare key-shaped strings on otherwise normal lines', () => {
    const out = redactLog('calling model with sk-or-v1-abcdef0123456789abcdef0123456789')
    expect(out).not.toMatch(/abcdef0123456789/)
  })
  it('leaves clean text untouched', () => expect(redactLog('a\nb')).toBe('a\nb'))
})
