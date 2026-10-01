// QA only (cloned profile, fake mic): drives Copilot → Audio in the running app, records the page state in both themes
// and the 3-second mic test. Usage: CDP_PORT=9334 OUT=<dir> LABEL=before|after node audio-qa.mjs
import fs from 'node:fs'
import { attach, clickText, sleep, waitTarget } from '../copilot-int-e2e/cdp.mjs'

const OUT = process.env.OUT, LABEL = process.env.LABEL ?? 'run'
fs.mkdirSync(OUT, { recursive: true })
const page = await attach(await waitTarget(t => /index\.html|127\.0\.0\.1/.test(t.url) && !t.url.includes('overlay')))
const emit = type => page.evaluate(`window.dispatchEvent(new CustomEvent(${JSON.stringify(type.name)}, { detail: ${JSON.stringify(type.detail)} }))`)
const theme = async t => { await page.evaluate(`document.documentElement.dataset.theme = ${JSON.stringify(t)}`); await sleep(250) }
const text = () => page.evaluate('document.body.innerText')
const meter = () => page.evaluate(`Number(document.querySelector('[role=meter]')?.getAttribute('aria-valuenow') ?? -1)`)

await emit({ name: 'careerloom:navigate', detail: 'copilot' }); await sleep(800)
await emit({ name: 'careerloom:copilot-goto', detail: 'audio' }); await sleep(1000)
const result = { label: LABEL }
result.options = await page.evaluate(`[...document.querySelectorAll('#mic-device option')].map(o => o.textContent)`)
result.systemGroup = (await text()).includes('Coming soon') ? 'coming soon' : 'offers system audio controls'
for (const t of ['dark', 'light']) { await theme(t); await page.shot(`${OUT}/audio-${LABEL}-${t}-idle.png`) }

await theme('dark')
await clickText(page, 'Test for 3 seconds', 'button')
const levels = []
for (let i = 0; i < 12; i++) { await sleep(300); levels.push(await meter()); if (i === 5) await page.shot(`${OUT}/audio-${LABEL}-dark-testing.png`) }
await sleep(800)
result.meterWhileTesting = { max: Math.max(...levels), samples: levels }
result.afterTest = (await text()).split('\n').filter(l => /Working|Silent|Blocked|No input|microphone|System Settings|not available|denied|blocked/i.test(l)).slice(0, 6)
for (const t of ['dark', 'light']) { await theme(t); await page.shot(`${OUT}/audio-${LABEL}-${t}-after-test.png`) }
fs.writeFileSync(`${OUT}/audio-${LABEL}.json`, JSON.stringify(result, null, 2))
console.log(JSON.stringify(result, null, 2))
process.exit(0)
