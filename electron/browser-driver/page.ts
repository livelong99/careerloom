// The fast driver's whole browser surface. By construction it can navigate (domain-locked), scroll, wait and
// evaluate Careerloom's own fixed extractor scripts: there is no click, type or select primitive, so a
// board page can't be made to apply, message, follow or save anything.
import type { PwCookie } from '../integrations/browser-cookies'
import { Cdp, nodeSocket, type Connect } from './cdp'
import { allowedNav, installNavLock } from './navlock'

export type Page = {
  navigate(url: string): Promise<void>
  scroll(): Promise<void>
  evaluate<T = unknown>(expression: string): Promise<T>
  html(): Promise<string>
  url(): Promise<string>
  close(): void
}

const SETTLE_MS = 15_000
const VIEWPORT = { width: 1120, height: 780 }

export class NavBlocked extends Error {}

/** CDP cookie params from storage-state cookies (session cookies carry expires ≤ 0). */
export const cookieParams = (cookies: PwCookie[]) => cookies.map(c => ({
  name: c.name, value: c.value, domain: c.domain, path: c.path, secure: c.secure, httpOnly: c.httpOnly, sameSite: c.sameSite,
  ...(c.expires > 0 ? { expires: c.expires } : {}),
}))

export async function openPage(wsUrl: string, domain: string, cookies: PwCookie[], connect: Connect = nodeSocket): Promise<Page> {
  const cdp = new Cdp(await connect(wsUrl))
  try {
    const { targetId } = await cdp.send<{ targetId: string }>('Target.createTarget', { url: 'about:blank' })
    const { sessionId } = await cdp.send<{ sessionId: string }>('Target.attachToTarget', { targetId, flatten: true })
    // Anything the page opens (window.open, target=_blank) is a second target outside the lock: close it.
    await cdp.send('Target.setDiscoverTargets', { discover: true })
    cdp.on('Target.targetCreated', p => {
      const info = p.targetInfo as { targetId: string; type: string } | undefined
      if (info && info.type === 'page' && info.targetId !== targetId) cdp.send('Target.closeTarget', { targetId: info.targetId }).catch(() => {})
    })
    const call = <T = Record<string, any>>(method: string, params: Record<string, unknown> = {}) => cdp.send<T>(method, params, sessionId)
    await call('Emulation.setDeviceMetricsOverride', { ...VIEWPORT, deviceScaleFactor: 1, mobile: false })
    const ua = (await call<{ result: { value: string } }>('Runtime.evaluate', { expression: 'navigator.userAgent', returnByValue: true })).result.value
    await call('Emulation.setUserAgentOverride', { userAgent: ua.replace('HeadlessChrome', 'Chrome') })
    await installNavLock(cdp, sessionId, domain)
    if (cookies.length) await call('Network.setCookies', { cookies: cookieParams(cookies) })

    const evaluate = async <T>(expression: string): Promise<T> => {
      const r = await call<{ result: { value: T }; exceptionDetails?: { text: string } }>('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true })
      if (r.exceptionDetails) throw new Error(`Page script failed: ${r.exceptionDetails.text}`)
      return r.result.value
    }
    const url = () => evaluate<string>('location.href')
    return {
      async navigate(target) {
        if (!allowedNav(target, domain)) throw new NavBlocked(`Navigation outside ${domain} refused`)
        await call('Page.navigate', { url: target })
        const deadline = Date.now() + SETTLE_MS
        while (Date.now() < deadline) {
          if (await evaluate<string>('document.readyState').catch(() => '') === 'complete') break
          await new Promise(r => setTimeout(r, 100))
        }
        const here = await url()
        if (!allowedNav(here, domain) && here !== 'chrome-error://chromewebdata/') throw new NavBlocked(`Page ended outside ${domain}`)
      },
      async scroll() {
        // Park over the left-middle, where result lists sit, and wheel down.
        const x = Math.round(VIEWPORT.width * 0.25), y = Math.round(VIEWPORT.height * 0.6)
        await call('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y })
        for (let i = 0; i < 3; i++) {
          await call('Input.dispatchMouseEvent', { type: 'mouseWheel', x, y, deltaX: 0, deltaY: 500 })
          await new Promise(r => setTimeout(r, 400))
        }
      },
      evaluate,
      html: () => evaluate<string>('document.documentElement.outerHTML'),
      url,
      close: () => cdp.close(),
    }
  } catch (err) {
    cdp.close()
    throw err
  }
}
