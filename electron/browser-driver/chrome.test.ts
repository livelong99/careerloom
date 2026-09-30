import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { describe, expect, it } from 'vitest'

import { COOKIE_TEMP_PREFIXES, sweepCookieTemp } from '../integrations/browser-cookies'
import { Cdp, CALL_TIMEOUT_MS } from './cdp'
import { browserCandidates, findBrowser, launchArgs, launchBrowser, parseActivePort, PROFILE_PREFIX } from './chrome'
import { fakeSocket } from './fake-cdp'

describe('browser detection (Windows paths are built and tested here, not run on Windows)', () => {
  it('lists Chrome then Edge on macOS', () => {
    expect(browserCandidates('darwin')[0]).toContain('Google Chrome')
    expect(browserCandidates('darwin')[1]).toContain('Microsoft Edge')
  })
  it('builds the Windows install locations from the environment', () => {
    const c = browserCandidates('win32', { PROGRAMFILES: 'C:\\Program Files', 'PROGRAMFILES(X86)': 'C:\\Program Files (x86)', LOCALAPPDATA: 'C:\\Users\\u\\AppData\\Local' })
    expect(c).toContain('C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe')
    expect(c).toContain('C:\\Users\\u\\AppData\\Local\\Microsoft\\Edge\\Application\\msedge.exe')
    expect(browserCandidates('win32', {})).toEqual([])
  })
  it('returns the first candidate that exists, else null', () => {
    expect(findBrowser('darwin', {}, p => p.includes('Edge'))).toContain('Microsoft Edge')
    expect(findBrowser('darwin', {}, () => false)).toBeNull()
  })
})

describe('launch arguments', () => {
  it('uses a private profile and an ephemeral debugging port', () => {
    const a = launchArgs('/tmp/cl-bd-x', false)
    expect(a).toContain('--user-data-dir=/tmp/cl-bd-x')
    expect(a).toContain('--remote-debugging-port=0')
    expect(a).not.toContain('--headless=new')
  })
  it('adds headless on request', () => expect(launchArgs('/p', true)).toContain('--headless=new'))
})

describe('parseActivePort', () => {
  it('builds the browser websocket url', () => expect(parseActivePort('9222\n/devtools/browser/abc-123')).toBe('ws://127.0.0.1:9222/devtools/browser/abc-123'))
  it.each(['', 'x\n/devtools/browser/a', '9222\n/other'])('rejects %j', t => expect(parseActivePort(t)).toBeNull())
})

describe('launchBrowser cleanup', () => {
  it('removes the private profile dir when the browser dies before it is ready', async () => {
    const before = new Set(fs.readdirSync(os.tmpdir()).filter(n => n.startsWith(PROFILE_PREFIX)))
    await expect(launchBrowser('/usr/bin/false', true)).rejects.toThrow(/exited/)
    const after = fs.readdirSync(os.tmpdir()).filter(n => n.startsWith(PROFILE_PREFIX) && !before.has(n))
    expect(after).toEqual([])
  })
  it('is swept at startup like every other cookie temp dir', () => {
    expect(COOKIE_TEMP_PREFIXES).toContain(PROFILE_PREFIX)
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), PROFILE_PREFIX))
    expect(sweepCookieTemp()).toBeGreaterThanOrEqual(1)
    expect(fs.existsSync(dir)).toBe(false)
  })
})

describe('Cdp', () => {
  it('matches responses to calls and dispatches events', async () => {
    const f = fakeSocket((m, p) => ({ echoed: m, p }))
    const c = new Cdp(f.socket)
    const seen: string[] = []
    c.on('X.happened', (p, sid) => seen.push(`${p.v}@${sid}`))
    await expect(c.send('A.b', { n: 1 }, 's')).resolves.toEqual({ echoed: 'A.b', p: { n: 1 } })
    f.emit('X.happened', { v: 7 }, 's9')
    expect(seen).toEqual(['7@s9'])
  })
  it('rejects a failed call with the browser message', async () => {
    const c = new Cdp(fakeSocket(() => { throw new Error('nope') }).socket)
    await expect(c.send('A.b')).rejects.toThrow('nope')
  })
  it('rejects pending and later calls once the browser goes away', async () => {
    const f = fakeSocket()
    const c = new Cdp(f.socket)
    f.drop()
    await expect(c.send('A.b')).rejects.toThrow(/closed/)
  })
  it('times a call out', async () => {
    const f = fakeSocket()
    f.socket.send = () => {} // never answers
    await expect(new Cdp(f.socket).send('A.b', {}, undefined, 20)).rejects.toThrow(/timed out/)
    expect(CALL_TIMEOUT_MS).toBeGreaterThan(1000)
  })
})
