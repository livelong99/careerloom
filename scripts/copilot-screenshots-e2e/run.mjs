// QA only (run by hand, see README.md): drives the real app over CDP through the screenshot path against the fake vision server.
// Needs: fake-vision-openrouter.mjs running, CL_COPILOT_E2E, a CLONED profile, TMPDIR=$QA/tmp (so the temp dir is inspectable).
import fs from 'node:fs'
import path from 'node:path'
import { attach, clickText, sleep, waitTarget } from '../copilot-int-e2e/cdp.mjs'

const EV = process.env.EV_DIR
const TMP = process.env.SHOT_TMP // getconf DARWIN_USER_TEMP_DIR (Electron ignores $TMPDIR on macOS)
const SHOTS = path.join(TMP, 'careerloom-copilot-shots')
const THEME = process.env.THEME || 'dark'
const END = process.env.END || 'stop' // stop | panic | quit: how the session ends, to prove each path removes the frames
const JOB = process.env.JOB || 'Engineering Manager'
fs.mkdirSync(EV, { recursive: true })
const frames = () => (fs.existsSync(SHOTS) ? fs.readdirSync(SHOTS) : [])
const log = (k, v) => console.log(k.padEnd(34), v)
const text = async p => (await p.evaluate('document.body?.innerText ?? ""')).replace(/\n+/g, ' | ')

const main = await attach(await waitTarget(t => t.url.includes('index.html')))
log('stale frame swept at startup', !frames().includes('shot-1-1.jpg'))

await main.evaluate(`window.careerloom.copilotStop('user')`); await sleep(1200)
await main.evaluate(`window.careerloom.copilotDeleteSession('all')`)
const cfg = await main.evaluate(`window.careerloom.copilotSetConfig({ overlay: { theme: ${JSON.stringify(THEME)}, layout: 'panel' }, engine: { screenshots: true, vision: 'vision', autoAnswer: false, models: { fast: 'qwen/qwen3-30b-a3b-instruct-2507', balanced: 'anthropic/claude-sonnet-5.5', deep: 'anthropic/claude-sonnet-5.5' } } }).then(c => JSON.stringify(c.engine))`)
log('engine config', cfg)
await main.evaluate(`window.dispatchEvent(new CustomEvent('careerloom:navigate', { detail: 'copilot' }))`); await sleep(1000)
await main.evaluate(`window.dispatchEvent(new CustomEvent('careerloom:copilot-goto', { detail: 'setup' }))`); await sleep(800)
log('job', await clickText(main, JOB)); await sleep(800)
await clickText(main, 'Start live session'); await sleep(700)
const tick = l => main.evaluate(`(() => { const b = [...document.querySelectorAll('[role=dialog] [role=checkbox]')].find(e => (e.getAttribute('aria-label')||'').startsWith(${JSON.stringify(l)})); if (b && b.getAttribute('aria-checked') !== 'true') b.click() })()`)
await tick("I'm allowed"); await tick('Everyone on this call'); await sleep(300)
await clickText(main, 'Start live session', '[role=dialog] button')
const ov = await attach(await waitTarget(t => t.url.includes('overlay.html'), 20000))
await ov.send('Emulation.setDeviceMetricsOverride', { width: 600, height: 760, deviceScaleFactor: 2, mobile: false }).catch(() => undefined)

// A harmless test page fills the display so the capture contains nothing of the user's.
await main.evaluate(`(() => { window.moveTo(0, 0); window.resizeTo(screen.availWidth, screen.availHeight) })()`)
await main.evaluate(`(() => { const d = document.createElement('div'); d.id = 'qa-page'; d.style.cssText = 'position:fixed;inset:0;z-index:2147483647;background:#fff;color:#111;display:flex;align-items:center;justify-content:center;font:700 64px ui-monospace,monospace;text-align:center'; d.innerHTML = 'CAREERLOOM-QA-PAGE<br><span style="font-size:28px;font-weight:400">def total(xs): return sorted(xs)[0] + sum(xs)</span>'; document.body.append(d) })()`)

// 1) small talk first (no capture), then the screen question (pre-capture)
let sawSmall = false, sawCoding = false, pre = 0
for (let i = 0; i < 60; i++) {
  const t = await text(ov)
  if (/see my screen okay/i.test(t)) sawSmall = true
  if (sawSmall && frames().length === 0 && !sawCoding) log('small talk: no frame captured', true)
  if (/time complexity of this function/i.test(t)) { sawCoding = true; pre = frames().length; if (pre) break }
  await sleep(500)
}
log('coding question visible', sawCoding)
log('pre-captured frames after question', pre)
await ov.shot(`${EV}/overlay-${THEME}-question.png`)

// 2) the Screenshot button
const label0 = await ov.evaluate(`[...document.querySelectorAll('.acts .ab')].map(b => b.textContent.trim())`)
log('buttons', JSON.stringify(label0))
log('screenshot clicked', await clickText(ov, 'Screenshot', '.acts .ab'))
await sleep(120)
await ov.shot(`${EV}/overlay-${THEME}-capturing.png`).catch(() => undefined)
let answered = false
for (let i = 0; i < 40 && !answered; i++) {
  const t = await text(ov)
  answered = /O\(n log n\)/.test(t)
  await sleep(400)
}
log('answer shown', answered)
const state = await ov.evaluate(`[...document.querySelectorAll('.acts .ab')].map(b => b.textContent.trim())`)
log('buttons after answer', JSON.stringify(state))
await ov.shot(`${EV}/overlay-${THEME}-answered.png`)
const reqs = fs.readFileSync(`${EV}/requests.jsonl`, 'utf8').trim().split('\n').map(l => JSON.parse(l)).filter(r => r.kind === 'answer')
log('answer requests / with image', `${reqs.length} / ${reqs.filter(r => r.imageBytes > 0).length}`)
log('last request parts', JSON.stringify(reqs.at(-1)))
log('temp frames during session', JSON.stringify(frames()))

// 3) cleanup on session stop
await main.evaluate(`document.getElementById('qa-page')?.remove()`)
if (END === 'quit') {
  const v = await (await fetch(`http://127.0.0.1:${process.env.CDP_PORT || 9333}/json/version`)).json()
  const browser = await attach({ webSocketDebuggerUrl: v.webSocketDebuggerUrl })
  void browser.send('Browser.close').catch(() => undefined)
  await sleep(3000)
} else {
  await main.evaluate(`window.careerloom.copilotStop(${JSON.stringify(END === 'panic' ? 'panic' : 'user')})`); await sleep(1500)
}
log(`temp frames after ${END}`, JSON.stringify(frames()))
process.exit(0)
