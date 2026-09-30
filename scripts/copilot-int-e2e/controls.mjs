// QA only: overlay Retry, panic (kill switch), and "Open debrief" against a running practice session.
import { attach, clickText, sleep, targets, waitTarget } from './cdp.mjs'

const EV = process.env.EV_DIR
const main = await attach(await waitTarget(t => t.url.includes('index.html')))
await main.evaluate(`window.careerloom.copilotStop('user')`); await sleep(1200)
await main.evaluate(`window.dispatchEvent(new CustomEvent('careerloom:copilot-goto', { detail: 'setup' }))`); await sleep(600)
await clickText(main, 'Start practice', 'button')
const ov = await attach(await waitTarget(t => t.url.includes('overlay.html'), 20000))
await sleep(3500)
const retry = await ov.evaluate(`window.careerloom.copilotOverlay({ retry: true }).then(() => 'ok', e => String(e))`)
await sleep(2000)
const stateAfterRetry = (await main.evaluate('document.body.innerText')).includes('Stop session') ? 'still running' : 'stopped'
console.log('retry:', retry, '→', stateAfterRetry)
const t0 = Date.now()
void ov.evaluate(`window.careerloom.copilotStop('panic')`).catch(() => undefined) // the window closes under it
for (let i = 0; i < 20; i++) { if (!(await targets()).some(t => t.url.includes('overlay.html'))) break; await sleep(100) }
console.log(`panic: overlay closed in ${Date.now() - t0} ms`)
await sleep(800)
const s = JSON.parse(await main.evaluate(`window.careerloom.copilotListSessions().then(s => JSON.stringify(s))`))[0]
console.log('session after panic:', { mode: s.mode, ended: s.endedAt !== null, questions: s.questions })
console.log('running flag cleared:', !(await main.evaluate('document.body.innerText')).includes('Stop session'))
await main.evaluate(`window.dispatchEvent(new CustomEvent('careerloom:navigate', { detail: 'overview' }))`); await sleep(600)
await main.evaluate(`window.careerloom.copilotOverlay({ debrief: true })`); await sleep(2500)
const txt = await main.evaluate('document.body.innerText')
console.log('debrief opens Sessions:', /Sessions & debrief/.test(txt))
await main.shot(`${EV}/debrief-link.png`)
process.exit(0)
