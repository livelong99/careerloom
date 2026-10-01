// QA only: screenshots every Copilot page + Settings page (dark+light) and flags overflow; cloned profile only (see docs/plans/fixes/layout/README.md).
import { attach, sleep, waitTarget } from '../copilot-int-e2e/cdp.mjs'
import { realClick as clickText } from './click.mjs'

const OUT = process.env.EV_DIR
const W = Number(process.env.W || 1280), H = Number(process.env.H || 860)
const COPILOT = ['Setup', 'Practice', 'Audio', 'Coaching', 'Appearance', 'Hotkeys', 'Sessions']
const SETTINGS = ['general', 'runners', 'keys', 'local-models', 'integrations', 'jobs', 'resume', 'agent', 'copilot', 'monitoring', 'data', 'advanced']
const page = await attach(await waitTarget(t => t.url.includes('index.html')))
await page.send('Emulation.setDeviceMetricsOverride', { width: W, height: H, deviceScaleFactor: 1, mobile: false })
await sleep(1500)
const nav = d => page.evaluate(`window.dispatchEvent(new CustomEvent('careerloom:navigate', { detail: ${JSON.stringify(d)} }))`)
const theme = t => page.evaluate(`(() => { document.documentElement.dataset.theme = ${JSON.stringify(t)}; localStorage.setItem('careerloom.theme', ${JSON.stringify(t)}) })()`)
/** Visible elements that spill past their scroll container's box, or text clipped by overflow. */
const probe = () => page.evaluate(`(() => {
  const out = []
  for (const el of document.querySelectorAll('main *, [role=tabpanel] *')) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue
    const p = el.closest('section,[data-slot=scroll-area-viewport],article') ?? document.body
    const pr = p.getBoundingClientRect()
    if (p !== el && r.right > pr.right + 2 && getComputedStyle(el).position !== 'fixed') out.push('spill ' + el.tagName + '.' + String(el.className).slice(0, 60) + ' "' + (el.textContent || '').trim().slice(0, 40) + '" +' + Math.round(r.right - pr.right))
    if (el.children.length === 0 && el.scrollWidth > el.clientWidth + 2 && getComputedStyle(el).overflow !== 'visible') out.push('clip ' + el.tagName + ' "' + (el.textContent || '').trim().slice(0, 40) + '"')
  }
  return out.slice(0, 25)
})()`)
const only = process.env.ONLY
for (const t of ['dark', 'light']) {
  await theme(t)
  if (!only || only === 'copilot') {
    await nav({ section: 'copilot' }); await sleep(1200)
    for (const p of COPILOT) {
      await clickText(page, p, '[role=tab]'); await sleep(900)
      await page.shot(`${OUT}/copilot-${p.toLowerCase()}-${t}.png`)
      console.log(t, 'copilot', p, JSON.stringify(await probe()))
    }
  }
  if (!only || only === 'settings') {
    for (const p of SETTINGS) {
      await nav({ section: 'settings', page: p }); await sleep(1200)
      await page.shot(`${OUT}/settings-${p}-${t}.png`)
      console.log(t, 'settings', p, JSON.stringify(await probe()))
    }
  }
}
process.exit(0)
