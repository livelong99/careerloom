import { describe, expect, it } from 'vitest'

import { parseSearxngUrl } from './searxng-url'
import { SEARXNG_IMAGE, searxngCompose, searxngSettings } from './searxng-compose'

describe('searxng compose', () => {
  it('binds loopback only, pins the image by digest, mounts the settings folder', () => {
    const c = searxngCompose('C:\\Users\\me\\searxng')
    expect(c).toContain('127.0.0.1:8888:8080')
    expect(SEARXNG_IMAGE).toMatch(/@sha256:[0-9a-f]{64}$/)
    expect(c).toContain('"C:\\\\Users\\\\me\\\\searxng"')
    expect(c).not.toContain('0.0.0.0')
  })
  it('turns JSON output on and the bot limiter off', () => {
    const y = searxngSettings('abc')
    expect(y).toContain('formats: [html, json]')
    expect(y).toContain('limiter: false')
    expect(y).toContain('secret_key: "abc"')
  })
})

describe('parseSearxngUrl', () => {
  it('accepts loopback http and trims the slash', () => expect(parseSearxngUrl('http://localhost:8888/')).toBe('http://localhost:8888'))
  it.each(['https://example.com', 'http://192.168.1.5:8888', 'http://user:pw@127.0.0.1', 'http://127.0.0.1:8888/?q=1', 'nope'])('refuses %s', u => expect(() => parseSearxngUrl(u)).toThrow())
})
