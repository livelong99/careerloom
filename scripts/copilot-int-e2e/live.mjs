// QA only (run by hand, see README.md): drives the real app over CDP through Setup → consent → live (mic) → detected question →
// answer streams → stop → Sessions → scorecard. Needs the fake OpenRouter server, CL_COPILOT_E2E and a cloned profile.
import fs from 'node:fs'
import { attach, clickText, sleep, waitTarget } from './cdp.mjs'

const EV = process.env.EV_DIR
const MODE = process.env.MODE || 'live'          // live | practice
const JOB = process.env.JOB || 'Engineering Manager'
const dir = `${EV}/frames-${MODE}${process.env.LAYOUT ? '-' + process.env.LAYOUT : ''}`
fs.mkdirSync(dir, { recursive: true })
const text = async p => (await p.evaluate('document.body?.innerText ?? ""')).replace(/\n+/g, ' | ')
const main = await attach(await waitTarget(t => t.url.includes('index.html')))
await main.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 960, deviceScaleFactor: 1, mobile: false })
await main.evaluate(`window.careerloom.copilotStop('user')`); await sleep(1500)
await main.evaluate(`window.careerloom.copilotDeleteSession('all')`)
if (process.env.LAYOUT) await main.evaluate(`window.careerloom.copilotSetConfig({ overlay: { layout: ${JSON.stringify(process.env.LAYOUT)} } })`)
await main.evaluate(`window.dispatchEvent(new CustomEvent('careerloom:navigate', { detail: 'copilot' }))`); await sleep(1200)
await main.evaluate(`window.dispatchEvent(new CustomEvent('careerloom:copilot-goto', { detail: 'setup' }))`); await sleep(800)
console.log('job', await clickText(main, JOB)); await sleep(800)

if (MODE === 'live') {
  await clickText(main, 'Start live session'); await sleep(700)
  const tick = l => main.evaluate(`(() => { const b = [...document.querySelectorAll('[role=dialog] [role=checkbox]')].find(e => (e.getAttribute('aria-label')||'').startsWith(${JSON.stringify(l)})); if (b && b.getAttribute('aria-checked') !== 'true') b.click() })()`)
  await tick("I'm allowed"); await tick('Everyone on this call'); await sleep(300)
  await main.shot(`${EV}/04-consent-ticked.png`)
  await clickText(main, 'Start live session', '[role=dialog] button')
} else {
  await clickText(main, 'Start practice', 'button')
}
const ov = await attach(await waitTarget(t => t.url.includes('overlay.html'), 20000))
const t0 = Date.now()
let answered = false, sawQuestion = false, shots = 0
const snap = async tag => { await ov.shot(`${dir}/f${String(shots++).padStart(2, '0')}-${tag}.png`) }
for (let i = 0; i < 40; i++) {
  const txt = await text(ov)
  const q = /migration under pressure/i.test(txt) && /Behavioural|Technical|Question/.test(txt) // the detected question (banner), not the partial
  if (q && !sawQuestion) { sawQuestion = true; console.log(`question visible @${Date.now() - t0}ms`) ; await snap('question') }
  if (MODE === 'live' && q && !answered) { answered = await clickText(ov, 'Answer'); console.log('answer clicked', answered, `@${Date.now() - t0}ms`) }
  await snap(answered ? 'ans' : 'pre')
  if (/Situation: forty services/.test(txt) && /Weekly releases again|Back to weekly/i.test(txt)) { console.log(`answer complete @${Date.now() - t0}ms`); await sleep(600); await snap('done'); break }
  if (MODE === 'practice' && i >= 18) break
  await sleep(600)
}
await sleep(MODE === 'live' ? 9000 : 6000)   // let the candidate's line (fixture t=11 s) arrive
await snap('late')
console.log('overlay final:', (await text(ov)).slice(0, 500))
await main.shot(`${EV}/${MODE}-main-running.png`)
console.log('stop', await clickText(main, 'Stop session')); await sleep(1500)
await snap('stopped').catch(() => undefined)
const sessions = await main.evaluate(`window.careerloom.copilotListSessions().then(s => JSON.stringify(s))`)
console.log('sessions', sessions)
await main.evaluate(`window.dispatchEvent(new CustomEvent('careerloom:copilot-goto', { detail: 'sessions' }))`); await sleep(2500)
await main.shot(`${EV}/${MODE}-sessions.png`)
for (let i = 0; i < 12; i++) {
  const s = JSON.parse(await main.evaluate(`window.careerloom.copilotListSessions().then(s => JSON.stringify(s))`))[0]
  if (s?.score != null) { console.log('scored', s.score); break }
  await sleep(1000)
}
await main.evaluate(`window.dispatchEvent(new CustomEvent('careerloom:copilot-goto', { detail: 'setup' }))`); await sleep(300)
await main.evaluate(`window.dispatchEvent(new CustomEvent('careerloom:copilot-goto', { detail: 'sessions' }))`); await sleep(2000)
await main.shot(`${EV}/${MODE}-sessions-scored.png`)
const det = await main.evaluate(`window.careerloom.copilotListSessions().then(async s => JSON.stringify(await window.careerloom.copilotGetSession(s[0].id)))`)
fs.writeFileSync(`${EV}/${MODE}-session.json`, JSON.stringify(JSON.parse(det), null, 2))
console.log('session saved: transcript', JSON.parse(det).transcript.length, 'questions', JSON.parse(det).questionsList.length, 'suggestions', JSON.parse(det).suggestions.length, 'score', JSON.parse(det).score)
process.exit(0)
