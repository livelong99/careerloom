// QA only: change theme / language / refresh / updates / doc defaults through the real controls, before a restart.
import { done, nav, open, record, sleep } from './lib.mjs'
const page = await open()
const go = async p => { await nav(page, { section: 'settings', page: p }); await sleep(1500) }
await go('general')
const tab = label => page.evaluate(`[...document.querySelectorAll('[role=tab],button')].find(e => e.textContent.trim() === ${JSON.stringify(label)})?.click()`)
await tab('Light'); await sleep(500)
await tab('5 minutes'); await sleep(500)
await page.evaluate(`document.querySelector('#settings-language').click()`); await sleep(400)
await page.evaluate(`[...document.querySelectorAll('[role=option]')].find(o => o.textContent.trim() === 'Français')?.click()`); await sleep(900)
await page.evaluate(`document.querySelector('[aria-label="Check for updates"]').click()`); await sleep(700)
await go('resume')
await tab('Formal'); await sleep(700)
const s = await page.evaluate(`JSON.stringify({ theme: localStorage.getItem('careerloom.theme'), keys: Object.keys(localStorage).filter(k => k.startsWith('careerloom')), prefs: null })`)
record('persist-set', 'persistence', true, s)
await page.shot(`${process.env.EV_DIR}/persist-before-restart-light.png`)
console.log(await page.evaluate(`JSON.stringify([...Object.entries(localStorage)].filter(([k]) => /careerloom/.test(k)))`), JSON.stringify(await page.evaluate(`window.careerloom.prefsGet()`)))
done()
