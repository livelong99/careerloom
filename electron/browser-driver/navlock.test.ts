import { describe, expect, it } from 'vitest'

import { Cdp } from './cdp'
import { fakeSocket } from './fake-cdp'
import { allowedNav, installNavLock } from './navlock'

describe('allowedNav', () => {
  it.each([
    'https://www.linkedin.com/jobs/search/?keywords=x', 'https://linkedin.com/jobs', 'http://in.linkedin.com/x', 'about:blank',
  ])('allows %s', url => expect(allowedNav(url, 'linkedin.com')).toBe(true))

  it.each([
    'https://attacker.com/', 'https://linkedin.com.attacker.com/', 'https://evillinkedin.com/', 'https://attacker.com/linkedin.com',
    'javascript:alert(1)', 'data:text/html,<b>x</b>', 'file:///etc/passwd', 'blob:https://www.linkedin.com/abc', 'chrome://settings', 'ftp://linkedin.com/', 'not a url', '',
  ])('refuses %s', url => expect(allowedNav(url, 'linkedin.com')).toBe(false))
})

describe('installNavLock', () => {
  const setup = async () => {
    const f = fakeSocket(m => (m === 'Page.getFrameTree' ? { frameTree: { frame: { id: 'main' } } } : {}))
    const cdp = new Cdp(f.socket)
    const blocked: string[] = []
    await installNavLock(cdp, 's1', 'linkedin.com', u => blocked.push(u))
    const paused = async (url: string, frameId: string, sid = 's1') => {
      const before = f.sent.length
      f.emit('Fetch.requestPaused', { requestId: `r${before}`, request: { url }, frameId, resourceType: 'Document' }, sid)
      await new Promise(r => setTimeout(r, 0))
      return f.sent.slice(before).map(s => s.method)
    }
    return { f, blocked, paused }
  }

  it('enables interception for documents only', async () => {
    const { f } = await setup()
    const enable = f.sent.find(s => s.method === 'Fetch.enable')!
    expect(enable.params.patterns).toEqual([{ urlPattern: '*', resourceType: 'Document' }])
    expect(enable.sessionId).toBe('s1')
  })

  it('fails a main-frame request to another domain, including a redirect hop', async () => {
    const { paused, blocked } = await setup()
    expect(await paused('https://attacker.com/steal', 'main')).toEqual(['Fetch.failRequest'])
    expect(await paused('https://linkedin.com.evil.io/', 'main')).toEqual(['Fetch.failRequest'])
    expect(blocked).toEqual(['https://attacker.com/steal', 'https://linkedin.com.evil.io/'])
  })

  it('continues on-domain main-frame documents and any sub-frame document', async () => {
    const { paused } = await setup()
    expect(await paused('https://www.linkedin.com/jobs', 'main')).toEqual(['Fetch.continueRequest'])
    expect(await paused('https://ads.example.net/frame', 'child')).toEqual(['Fetch.continueRequest'])
  })

  it('ignores events from other sessions', async () => {
    const { paused } = await setup()
    expect(await paused('https://attacker.com/', 'main', 'other')).toEqual([])
  })

  it('rejects a domain that is not plain', async () => {
    const f = fakeSocket()
    await expect(installNavLock(new Cdp(f.socket), 's', 'a.com/../b')).rejects.toThrow(/plain domain/)
  })
})
