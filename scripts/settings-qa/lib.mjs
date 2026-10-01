// QA only helpers on top of the CDP client: page handle, waits, typing, pass/fail recording.
import fs from 'node:fs'
import { attach, clickText, sleep, waitTarget } from '../copilot-int-e2e/cdp.mjs'

export { clickText, sleep }
export const EV = process.env.EV_DIR
export const SENTINEL = 'sk-or-QASENTINEL0123456789abcdef'
const RESULTS = `${EV}/results.jsonl`

export async function open() {
  const page = await attach(await waitTarget(t => t.url.includes('index.html')))
  await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false })
  return page
}
export const done = () => process.exit(0)
export const text = page => page.evaluate('document.body.innerText')
export const nav = (page, d) => page.evaluate(`window.dispatchEvent(new CustomEvent('careerloom:navigate', { detail: ${JSON.stringify(d)} }))`)
export const theme = (page, t) => page.evaluate(`(() => { document.documentElement.dataset.theme = ${JSON.stringify(t)}; localStorage.setItem('careerloom.theme', ${JSON.stringify(t)}) })()`)
export async function waitText(page, re, ms = 8000) {
  const end = Date.now() + ms
  while (Date.now() < end) { if (new RegExp(re, 'i').test(await text(page))) return true; await sleep(250) }
  return false
}
export async function type(page, selector, value) {
  await page.evaluate(`document.querySelector(${JSON.stringify(selector)}).focus()`)
  await page.send('Input.insertText', { text: value })
}
export async function key(page, k, modifiers = 0, extra = {}) {
  const code = { type: 'keyDown', key: k, modifiers, ...extra }
  await page.send('Input.dispatchKeyEvent', code); await page.send('Input.dispatchKeyEvent', { ...code, type: 'keyUp' })
}
export function record(id, area, pass, note = '') {
  fs.appendFileSync(RESULTS, JSON.stringify({ id, area, pass, note }) + '\n')
  console.log(pass ? 'PASS' : 'FAIL', id, note)
}
/** Where would a leaked secret show up in the renderer: DOM text/attributes, web storage. */
export const sentinelLeak = page => page.evaluate(`(() => {
  const hits = []
  if (document.documentElement.outerHTML.includes('QASENTINEL')) hits.push('dom')
  if (JSON.stringify({ ...localStorage }).includes('QASENTINEL')) hits.push('localStorage')
  if (JSON.stringify({ ...sessionStorage }).includes('QASENTINEL')) hits.push('sessionStorage')
  return hits
})()`)
