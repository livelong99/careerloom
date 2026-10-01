// QA only: walks every Settings page dark+light on a cloned profile over CDP. Never point at real data.
import { attach, sleep, waitTarget } from '../copilot-int-e2e/cdp.mjs'

const OUT = process.env.EV_DIR
const PAGES = ['general', 'runners', 'keys', 'local-models', 'integrations', 'jobs', 'resume', 'agent', 'copilot', 'monitoring', 'data', 'advanced']
const page = await attach(await waitTarget(t => t.url.includes('index.html')))
await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false })
const nav = d => page.evaluate(`window.dispatchEvent(new CustomEvent('careerloom:navigate', { detail: ${JSON.stringify(d)} }))`)
const theme = t => page.evaluate(`(() => { document.documentElement.dataset.theme = ${JSON.stringify(t)}; localStorage.setItem('careerloom.theme', ${JSON.stringify(t)}) })()`)
for (const t of ['dark', 'light']) {
  await theme(t)
  for (const p of PAGES) {
    await nav({ section: 'settings', page: p }); await sleep(1500)
    const info = await page.evaluate(`({ title: document.querySelector('[role=tabpanel] h2, main h2')?.textContent, text: document.body.innerText.length, err: [...document.querySelectorAll('[role=alert]')].map(e => e.textContent.slice(0, 120)) })`)
    console.log(t, p, JSON.stringify(info))
    await page.shot(`${OUT}/${p}-${t}.png`)
  }
}
