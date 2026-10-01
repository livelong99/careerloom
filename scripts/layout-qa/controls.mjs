// QA only: per page, hit-tests every interactive control (is it the topmost element at its centre, not disabled/pointer-events:none)
// and really toggles switches / radios / ranges / selects, reporting any whose state does not change. Cloned profile only.
import { attach, sleep, waitTarget } from '../copilot-int-e2e/cdp.mjs'
import { realClick } from './click.mjs'

const COPILOT = ['Setup', 'Practice', 'Audio', 'Coaching', 'Appearance', 'Hotkeys', 'Sessions']
const SETTINGS = ['general', 'runners', 'keys', 'local-models', 'integrations', 'jobs', 'resume', 'agent', 'copilot', 'monitoring', 'data', 'advanced']
const page = await attach(await waitTarget(t => t.url.includes('index.html')))
await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 2400, deviceScaleFactor: 1, mobile: false })
const nav = d => page.evaluate(`window.dispatchEvent(new CustomEvent('careerloom:navigate', { detail: ${JSON.stringify(d)} }))`)
const CTL = 'button,[role=switch],[role=radio],[role=tab],[role=checkbox],[role=combobox],select,input,textarea,a[href]'
const hit = () => page.evaluate(`(() => {
  const scope = document.querySelector('[role=tabpanel]:not([hidden])') ?? document.querySelector('main') ?? document.body
  const bad = []
  for (const el of scope.querySelectorAll(${JSON.stringify(CTL)})) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height || getComputedStyle(el).visibility === 'hidden') continue
    const lab = (el.getAttribute('aria-label') || el.textContent || el.id || el.placeholder || el.tagName).trim().slice(0, 40)
    if (el.disabled || el.getAttribute('aria-disabled') === 'true') { bad.push('disabled: ' + lab); continue }
    const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)
    if (top && top !== el && !el.contains(top) && !top.contains(el) && !el.closest('label')?.contains(top)) bad.push('blocked by ' + top.tagName + '.' + String(top.className).slice(0, 40) + ': ' + lab)
    else if (getComputedStyle(el).pointerEvents === 'none') bad.push('pointer-events none: ' + lab)
  }
  return bad
})()`)
const state = el => `(() => { const e = ${el}; return e.getAttribute('aria-checked') ?? e.getAttribute('aria-pressed') ?? e.getAttribute('data-state') ?? e.value })()`
/** Click each switch/radio (then click it back) and report ones whose aria state never changed. */
const toggles = () => page.evaluate(`(() => [...(document.querySelector('[role=tabpanel]:not([hidden])') ?? document.body).querySelectorAll('[role=switch],[role=radio]')].filter(e => e.offsetParent && !e.disabled).map((e, i) => ({ i, lab: (e.getAttribute('aria-label') || e.textContent).trim().slice(0, 40), role: e.getAttribute('role') })))()`)
async function exercise(tag) {
  const out = { hit: await hit(), dead: [] }
  const list = await toggles()
  for (const t of list) {
    const sel = `[...(document.querySelector('[role=tabpanel]:not([hidden])') ?? document.body).querySelectorAll('[role=switch],[role=radio]')].filter(e => e.offsetParent && !e.disabled)[${t.i}]`
    let before
    try { before = await page.evaluate(state(sel)) } catch { continue } // list shifted after an earlier toggle re-rendered the page
    const pt = await page.evaluate(`(() => { const e = ${sel}; e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 } })()`)
    for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...pt, button: 'left', clickCount: 1 })
    await sleep(350)
    const after = await page.evaluate(state(sel))
    if (before === after && !(t.role === 'radio' && before === 'true')) out.dead.push(`${t.role} no change: ${t.lab} (${before})`)
    if (before !== after && t.role === 'switch') { for (const type of ['mousePressed', 'mouseReleased']) await page.send('Input.dispatchMouseEvent', { type, ...pt, button: 'left', clickCount: 1 }); await sleep(250) }
  }
  // ranges and native selects: focus, nudge with the keyboard, expect the value to move; then put it back.
  const nudged = await page.evaluate(`(async () => {
    const out = []
    for (const e of (document.querySelector('[role=tabpanel]:not([hidden])') ?? document.body).querySelectorAll('input[type=range],select')) {
      if (!e.offsetParent || e.disabled) continue
      const lab = (e.id || e.getAttribute('aria-label') || e.name || e.tagName).slice(0, 30), v = e.value
      const set = Object.getOwnPropertyDescriptor(e.tagName === 'SELECT' ? HTMLSelectElement.prototype : HTMLInputElement.prototype, 'value').set
      const next = e.tagName === 'SELECT' ? ([...e.options].find(o => o.value !== v && !o.disabled)?.value ?? v) : String(Number(v) + Number(e.step || 1) * 2 > Number(e.max) ? Number(v) - Number(e.step || 1) * 2 : Number(v) + Number(e.step || 1) * 2)
      set.call(e, next); e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); await new Promise(r => setTimeout(r, 250))
      out.push({ lab, kind: e.tagName, v, now: e.value, next })
      set.call(e, v); e.dispatchEvent(new Event(e.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); await new Promise(r => setTimeout(r, 150))
    }
    return out
  })()`)
  for (const n of nudged) if (n.now === n.v && n.next !== n.v) out.dead.push(`${n.kind} did not take ${n.next}: ${n.lab}`)
  console.log(tag, JSON.stringify({ controls: list.length, ...out }))
}
await nav({ section: 'copilot' }); await sleep(1200)
for (const p of COPILOT) { await realClick(page, p, '[role=tab]'); await sleep(900); await exercise('copilot/' + p) }
for (const p of SETTINGS) { await nav({ section: 'settings', page: p }); await sleep(1200); await exercise('settings/' + p) }
process.exit(0)
