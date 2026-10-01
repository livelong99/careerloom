// QA only: shared helpers for the KB integration run (CDP over the cloned-profile app, see README.md).
import fs from 'node:fs'
// run with CDP_PORT=9341 (cdp.mjs reads it at import)
export { attach, clickText, sleep, waitTarget } from '../copilot-int-e2e/cdp.mjs'
import { attach, sleep, waitTarget } from '../copilot-int-e2e/cdp.mjs'

export const OUT = process.env.EV_DIR || 'docs/plans/job-knowledge-base/qa/int'
fs.mkdirSync(OUT, { recursive: true })
export const JOB = process.env.JOB_ID || 'https://www.google.com/about/careers/applications/jobs/results/121538506244661958-senior-software-engineer-core?q=Senior+Software+Engineer&location=India&hl=en-US'

const RESULTS = `${OUT}/results.json`
export const record = (id, name, pass, detail = '') => {
  const all = fs.existsSync(RESULTS) ? JSON.parse(fs.readFileSync(RESULTS, 'utf8')) : {}
  all[id] = { name, pass: !!pass, detail: String(detail).slice(0, 400) }
  fs.writeFileSync(RESULTS, JSON.stringify(all, null, 1))
  console.log(pass ? 'PASS' : 'FAIL', id, name, detail ? `— ${String(detail).slice(0, 160)}` : '')
}
export const mainWindow = async () => {
  const main = await attach(await waitTarget(t => t.url.includes('index.html')))
  await main.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
  return main
}
export const theme = (page, mode) => page.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: mode }] })
export const text = async p => (await p.evaluate('document.body?.innerText ?? ""')).replace(/\n+/g, ' | ')
const TAB = { kb: 'Knowledge base', skillup: 'Skill-up', match: 'Match', overview: 'Overview' }
export const openJobTab = async (main, tab) => {
  await main.evaluate(`sessionStorage.setItem('careerloom.job.tab', ${JSON.stringify(tab)}); window.dispatchEvent(new CustomEvent('careerloom:navigate', { detail: { section: 'job', id: ${JSON.stringify(JOB)} } }))`)
  await sleep(1200)
  // Radix tabs react to mousedown, not click; the page may already be open on another tab
  await main.evaluate(`(() => { const t = [...document.querySelectorAll('[role=tab]')].find(e => e.textContent.trim() === ${JSON.stringify(TAB[tab])}); if (t) { t.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })); t.click() } })()`)
  await sleep(600)
}
export const goto = async (main, section, extra = {}) => { await main.evaluate(`window.dispatchEvent(new CustomEvent('careerloom:navigate', { detail: ${JSON.stringify({ section, ...extra })} }))`); await sleep(1200) }
export const shotBoth = async (page, name) => {
  for (const m of ['dark', 'light']) { await theme(page, m); await sleep(500); await page.shot(`${OUT}/${name}-${m}.png`) }
  await theme(page, 'dark')
}
