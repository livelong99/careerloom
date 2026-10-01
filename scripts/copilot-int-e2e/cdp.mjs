// QA only: a tiny Chrome-DevTools-Protocol client for the Electron windows (Node 22 global WebSocket, no dependencies).
import fs from 'node:fs'

export const PORT = Number(process.env.CDP_PORT || 9333)
export const sleep = ms => new Promise(r => setTimeout(r, ms))

export async function targets() {
  const r = await fetch(`http://127.0.0.1:${PORT}/json`)
  return (await r.json()).filter(t => t.type === 'page')
}
export async function waitTarget(match, ms = 30000) {
  const end = Date.now() + ms
  for (;;) {
    const t = (await targets().catch(() => [])).find(match)
    if (t) return t
    if (Date.now() > end) throw new Error('target not found')
    await sleep(300)
  }
}
export async function attach(target) {
  const ws = new WebSocket(target.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let id = 0
  const waiting = new Map()
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id) } }
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; waiting.set(i, m => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })) })
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  const shot = async file => { const r = await send('Page.captureScreenshot', { format: 'png' }); fs.writeFileSync(file, Buffer.from(r.data, 'base64')); return file }
  return { send, evaluate, shot, close: () => ws.close() }
}
/** Click the first visible element (button/label/radio/tab…) whose text or aria-label matches. */
export const clickText = (page, text, sel = 'button,[role=button],[role=tab],[role=radio],[role=option],label,a') => page.evaluate(`(() => {
  const want = ${JSON.stringify(text)}.toLowerCase()
  const els = [...document.querySelectorAll(${JSON.stringify(sel)})].filter(e => e.offsetParent !== null)
  const el = els.find(e => ((e.getAttribute('aria-label') || '') + ' ' + e.textContent).trim().toLowerCase().includes(want))
  if (!el) return false
  el.click(); return true
})()`)
