import { describe, expect, it } from 'vitest'

import { CONSENT_MAX_AGE_MS, CONSENT_TEXT_VERSION, validateConsent } from './consent'
import type { ConsentRecord } from './types'

const NOW = 1_000_000_000_000
const good: ConsentRecord = {
  id: 'c1', sessionId: 's1', at: NOW - 1000, textVersion: CONSENT_TEXT_VERSION,
  aiAllowedConfirmed: true, everyoneInformedConfirmed: true, jurisdiction: null,
  sources: ['mic'], sttProvider: 'moonshine', llmProvider: 'openrouter', transcriptSaved: true, privacyMode: false, indicator: 'chip',
}

describe('validateConsent (server-side gate for live sessions)', () => {
  it('accepts a fresh, fully confirmed record', () => {
    expect(validateConsent(good, NOW)).toEqual({ ok: true })
  })
  it('rejects null / non-object', () => {
    expect(validateConsent(null, NOW).ok).toBe(false)
    expect(validateConsent('yes', NOW).ok).toBe(false)
  })
  it.each([['aiAllowedConfirmed'], ['everyoneInformedConfirmed']])('rejects when %s is not exactly true', key => {
    expect(validateConsent({ ...good, [key]: false }, NOW).ok).toBe(false)
    expect(validateConsent({ ...good, [key]: 'true' }, NOW).ok).toBe(false)
  })
  it('rejects a stale text version', () => {
    expect(validateConsent({ ...good, textVersion: 'old' }, NOW)).toMatchObject({ ok: false })
  })
  it('rejects records older than 10 minutes or from the future', () => {
    expect(validateConsent({ ...good, at: NOW - CONSENT_MAX_AGE_MS - 1 }, NOW).ok).toBe(false)
    expect(validateConsent({ ...good, at: NOW + 60_000 }, NOW).ok).toBe(false)
  })
  it('requires the microphone and only known sources', () => {
    expect(validateConsent({ ...good, sources: [] }, NOW).ok).toBe(false)
    expect(validateConsent({ ...good, sources: ['system'] }, NOW).ok).toBe(false)
    expect(validateConsent({ ...good, sources: ['mic', 'bogus'] }, NOW).ok).toBe(false)
    expect(validateConsent({ ...good, sources: ['mic', 'system'] }, NOW).ok).toBe(true)
  })
  it('rejects an unknown indicator', () => {
    expect(validateConsent({ ...good, indicator: 'hidden' }, NOW).ok).toBe(false)
  })
})
