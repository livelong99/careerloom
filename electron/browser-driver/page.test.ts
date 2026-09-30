import { describe, expect, it } from 'vitest'

import { fakeSocket } from './fake-cdp'
import { NavBlocked, cookieParams, openPage } from './page'

const cookie = { name: 'li_at', value: 'SECRET-VALUE', domain: '.linkedin.com', path: '/', expires: 0, httpOnly: true, secure: true, sameSite: 'None' as const }

function harness(href = 'https://www.linkedin.com/jobs/search/') {
  const state = { href }
  const f = fakeSocket((m, p) => {
    if (m === 'Target.createTarget') return { targetId: 't1' }
    if (m === 'Target.attachToTarget') return { sessionId: 's1' }
    if (m === 'Page.getFrameTree') return { frameTree: { frame: { id: 'main' } } }
    if (m === 'Runtime.evaluate') {
      const e = String(p.expression)
      return { result: { value: e === 'navigator.userAgent' ? 'Mozilla HeadlessChrome/150' : e === 'document.readyState' ? 'complete' : e === 'location.href' ? state.href : `ran:${e}` } }
    }
    return {}
  })
  return { f, state }
}

describe('cookieParams', () => {
  it('drops expires for session cookies and keeps persistent ones', () => {
    expect(cookieParams([cookie])[0]).not.toHaveProperty('expires')
    expect(cookieParams([{ ...cookie, expires: 1900000000 }])[0]).toHaveProperty('expires', 1900000000)
  })
})

describe('openPage', () => {
  it('locks navigation, strips the headless UA and seeds cookies', async () => {
    const { f } = harness()
    await openPage('ws://x', 'linkedin.com', [cookie], async () => f.socket)
    const methods = f.sent.map(s => s.method)
    expect(methods).toContain('Fetch.enable')
    expect(f.sent.find(s => s.method === 'Emulation.setUserAgentOverride')!.params.userAgent).toBe('Mozilla Chrome/150')
    expect(f.sent.find(s => s.method === 'Network.setCookies')!.params.cookies[0].name).toBe('li_at')
  })

  it('refuses to navigate off the domain before any request is made', async () => {
    const { f } = harness()
    const page = await openPage('ws://x', 'linkedin.com', [], async () => f.socket)
    for (const url of ['https://attacker.com/', 'javascript:alert(1)', 'file:///etc/passwd', 'data:text/html,x']) {
      await expect(page.navigate(url)).rejects.toBeInstanceOf(NavBlocked)
    }
    expect(f.sent.some(s => s.method === 'Page.navigate')).toBe(false)
  })

  it('throws if the page ends up off the domain after navigating', async () => {
    const { f, state } = harness()
    const page = await openPage('ws://x', 'linkedin.com', [], async () => f.socket)
    state.href = 'https://attacker.com/'
    await expect(page.navigate('https://www.linkedin.com/jobs')).rejects.toBeInstanceOf(NavBlocked)
  })

  it('closes any extra page target the site opens', async () => {
    const { f } = harness()
    await openPage('ws://x', 'linkedin.com', [], async () => f.socket)
    f.emit('Target.targetCreated', { targetInfo: { targetId: 'popup', type: 'page' } })
    await new Promise(r => setTimeout(r, 0))
    expect(f.sent.find(s => s.method === 'Target.closeTarget')!.params.targetId).toBe('popup')
  })

  it('exposes no click / type / select primitive', async () => {
    const { f } = harness()
    const page = await openPage('ws://x', 'linkedin.com', [], async () => f.socket)
    expect(Object.keys(page).sort()).toEqual(['close', 'evaluate', 'html', 'navigate', 'scroll', 'url'])
    await page.scroll()
    const inputs = f.sent.filter(s => s.method.startsWith('Input.')).map(s => s.params.type)
    expect(new Set(inputs)).toEqual(new Set(['mouseMoved', 'mouseWheel'])) // never mousePressed / keyDown / insertText
  })
})
