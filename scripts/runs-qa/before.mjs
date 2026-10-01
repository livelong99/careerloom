// QA only: "before" shots of the old Runs side drawer (commit af862ce), dark + light, with one live run. Cloned profile only.
import { attach, sleep, waitTarget } from '../copilot-int-e2e/cdp.mjs'

const OUT = process.env.EV_DIR
const page = await attach(await waitTarget(t => t.url.includes('index.html')))
await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false })
await sleep(1500)
const theme = t => page.evaluate(`(() => { document.documentElement.dataset.theme = ${JSON.stringify(t)}; localStorage.setItem('careerloom.theme', ${JSON.stringify(t)}) })()`)
await page.evaluate(`(async () => { const p = (await window.careerloom.listPortals()).find(x => x.name === 'QA Fake Co'); await window.careerloom.scanPortals([p.id]) })()`)
await sleep(5000)
for (const t of ['dark', 'light']) {
  await theme(t)
  await page.evaluate(`[...document.querySelectorAll('button')].find(b => /Runs|running/.test(b.textContent))?.click()`)
  await sleep(1000)
  await page.shot(`${OUT}/before-drawer-${t}.png`)
  await page.send('Input.dispatchKeyEvent', { type: 'keyDown', key: 'Escape' }); await page.send('Input.dispatchKeyEvent', { type: 'keyUp', key: 'Escape' })
  await sleep(500)
}
console.log('before shots done')
process.exit(0)
