// Main-frame navigation lock: the page may only ever load documents from the board's registrable domain
// (and its subdomains). Enforced in the browser through CDP request interception, so redirects and
// script-driven navigations are covered too; the driver's own navigate() is checked first.
import type { Cdp } from './cdp'

export function allowedNav(url: string, domain: string): boolean {
  if (url === 'about:blank') return true
  try {
    const u = new URL(url)
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return false // javascript:, file:, data:, blob:, chrome:
    const h = u.hostname.toLowerCase()
    return h === domain || h.endsWith('.' + domain)
  } catch { return false }
}

export async function installNavLock(cdp: Cdp, sessionId: string, domain: string, onBlocked: (url: string) => void = () => {}): Promise<void> {
  if (!/^[a-z0-9.-]+$/.test(domain)) throw new Error('Browser boards need a plain domain')
  await cdp.send('Page.enable', {}, sessionId)
  const tree = await cdp.send<{ frameTree: { frame: { id: string } } }>('Page.getFrameTree', {}, sessionId)
  const mainFrame = tree.frameTree.frame.id
  cdp.on('Fetch.requestPaused', (p, sid) => {
    if (sid !== sessionId) return
    const url = String(p.request?.url ?? '')
    const blocked = p.frameId === mainFrame && !allowedNav(url, domain)
    if (blocked) onBlocked(url)
    const request = blocked
      ? cdp.send('Fetch.failRequest', { requestId: p.requestId, errorReason: 'BlockedByClient' }, sessionId)
      : cdp.send('Fetch.continueRequest', { requestId: p.requestId }, sessionId)
    request.catch(() => { /* the page went away */ })
  })
  await cdp.send('Fetch.enable', { patterns: [{ urlPattern: '*', resourceType: 'Document' }] }, sessionId)
}
