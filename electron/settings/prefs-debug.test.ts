import { describe, expect, it } from 'vitest'
import { applyPrefsPatch, defaultPrefs, normalizePrefs } from './prefs'

describe('prefs.debug', () => {
  it('is off by default and ignores a relative or junk folder from an old file', () => {
    expect(defaultPrefs().debug.dir).toBeNull()
    expect(normalizePrefs({ debug: { dir: 'relative/x' } }).debug.dir).toBeNull()
    expect(normalizePrefs({ debug: { dir: 5 } }).debug.dir).toBeNull()
  })
  it('accepts an absolute folder or null and rejects anything else', () => {
    const on = applyPrefsPatch(defaultPrefs(), { debug: { dir: '/tmp/logs' } })
    expect(on.debug.dir).toBe('/tmp/logs')
    expect(applyPrefsPatch(on, { debug: { dir: null } }).debug.dir).toBeNull()
    expect(() => applyPrefsPatch(on, { debug: { dir: 'logs' } })).toThrow()
    expect(applyPrefsPatch(on, { updates: { enabled: false } }).debug.dir).toBe('/tmp/logs')
  })
})
