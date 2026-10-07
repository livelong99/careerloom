// QA only: packaged-style smoke on a CLONED profile. Opens every sidebar page, collects console errors, then turns the
// Debug log on into a temp folder and checks the log file. Env: CDP_PORT, EV_DIR (evidence), DEBUG_DIR (empty temp folder).
import fs from 'node:fs'
import { sleep, waitTarget } from '../copilot-int-e2e/cdp.mjs'

const EV = process.env.EV_DIR
const DEBUG_DIR = process.env.DEBUG_DIR
const target = await waitTarget(t => t.url.includes('index.html'))
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
let n = 0
const waiting = new Map()
const errors = []
ws.onmessage = e => {
  const m = JSON.parse(e.data)
  if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id) }
  else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(`console.error: ${m.params.args.map(a => a.value ?? a.description ?? '').join(' ').slice(0, 300)}`)
  else if (m.method === 'Runtime.exceptionThrown') errors.push(`exception: ${m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text}`.slice(0, 300))
  else if (m.method === 'Log.entryAdded' && m.params.entry.level === 'error') errors.push(`log: ${m.params.entry.text} ${m.params.entry.url ?? ''}`.slice(0, 300))
}
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++n; waiting.set(i, m => (m.error ? rej(new Error(m.error.message)) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })) })
const ev = async expression => (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result.value
const shot = async name => fs.writeFileSync(`${EV}/${name}.png`, Buffer.from((await send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
const results = []
const rec = (id, pass, note = '') => { results.push({ id, pass, note }); console.log(pass ? 'PASS' : 'FAIL', id, note) }

await send('Runtime.enable'); await send('Log.enable'); await send('Page.enable')
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false })
await send('Page.reload'); await sleep(4000)

const pages = [['overview', 'Overview'], ['jobs', 'Jobs'], ['boards', 'Boards'], ['resume', 'Resume'], ['agent', 'Agent'], ['monitoring', 'Monitoring'], ['runs', 'Runs'], ['copilot', 'Copilot'], ['settings', 'Settings']]
for (const [id, title] of pages) {
  const before = errors.length
  await ev(`window.dispatchEvent(new CustomEvent('careerloom:navigate', { detail: ${JSON.stringify(id)} }))`); await sleep(1800)
  const h1 = await ev(`document.querySelector('h1.t')?.textContent ?? ''`)
  const body = await ev('document.body.innerText.length')
  await shot(`page-${id}`)
  rec(`page-${id}`, h1 === title && body > 50 && errors.length === before, `h1="${h1}" textLen=${body} newErrors=${errors.length - before}`)
}
// Settings pages
const settingsPages = await ev(`[...document.querySelectorAll('nav a, nav button, [role=tab]')].map(e => e.textContent.trim()).filter(Boolean).slice(0, 40)`)
console.log('settings nav:', JSON.stringify(settingsPages))
for (const p of ['general', 'jobs', 'advanced']) {
  const before = errors.length
  await ev(`window.dispatchEvent(new CustomEvent('careerloom:navigate', { detail: { section: 'settings', page: ${JSON.stringify(p)} } }))`); await sleep(1500)
  await shot(`settings-${p}`)
  rec(`settings-${p}`, errors.length === before, `newErrors=${errors.length - before}`)
}
// Debug log: same IPC the "Turn on…" button sends after the folder picker
await ev(`window.dispatchEvent(new CustomEvent('careerloom:navigate', { detail: { section: 'settings', page: 'advanced', focus: 'debug-log' } }))`); await sleep(1200)
const bad = await ev(`window.careerloom.prefsSet({ debug: { dir: '/nonexistent/qa' } }).then(() => 'accepted', e => 'refused: ' + e.message)`)
rec('debug-bad-folder-refused', /refused/.test(bad), bad)
const on = await ev(`window.careerloom.prefsSet({ debug: { dir: ${JSON.stringify(DEBUG_DIR)} } }).then(p => p.debug.dir, e => 'error: ' + e.message)`)
rec('debug-turn-on', on === DEBUG_DIR, String(on))
await sleep(500)
await ev(`window.careerloom.listJobs().then(j => j.length)`) // any IPC call is logged
await ev(`window.careerloom.prefsSet({ evalPipeline: { enabled: false } })`)
await sleep(800)
await send('Page.reload'); await sleep(3500) // prefs were set over IPC, not through the page: reload to render them
await ev(`window.dispatchEvent(new CustomEvent('careerloom:navigate', { detail: { section: 'settings', page: 'advanced', focus: 'debug-log' } }))`); await sleep(1500)
await shot('settings-advanced-debug-on')
const uiRow = await ev(`/Log folder/.test(document.body.innerText) && document.body.innerText.includes(${JSON.stringify(DEBUG_DIR)})`)
rec('debug-ui-shows-folder', uiRow === true)
await ev(`window.careerloom.prefsSet({ debug: { dir: null } })`); await sleep(500)
await send('Runtime.disable')
fs.writeFileSync(`${EV}/smoke-results.json`, JSON.stringify({ results, errors }, null, 1))
console.log('console errors:', errors.length, errors.slice(0, 10))
process.exit(0)
