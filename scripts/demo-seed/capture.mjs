#!/usr/bin/env node
// Drives a running demo app (see README.md) over CDP and writes 1440x900 screenshots at 2x, light and dark.
//   CDP_PORT=9444 node scripts/demo-seed/capture.mjs --out /private/tmp/shots-raw [--only jobs,boards] [--themes dark,light]
// Every screen's visible text is scanned for real-looking personal data and the page console for errors.
import fs from 'node:fs'
import { execFileSync } from 'node:child_process'
import path from 'node:path'

const PORT = Number(process.env.CDP_PORT || 9444)
const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i > 0 ? process.argv[i + 1] : d }
const OUT = path.resolve(arg('out', '/private/tmp/shots-raw'))
const ONLY = arg('only', '') ? arg('only').split(',') : null
const THEMES = arg('themes', 'dark,light').split(',')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const FORBIDDEN = /perkypanda|\/Users\/|gmail|vabhav|livelong/i

// Full screen through macOS accessibility (needs the terminal allowed under Privacy > Accessibility): the window
// gets the display's real size. Electron's CDP has no Browser.setWindowBounds.
async function setFullScreen(on) {
  const pid = arg('pid', '')
  if (!pid) throw new Error('Pass --pid <Electron main process id>, or --viewport for the fixed 1440x900 mode')
  execFileSync('osascript', ['-e', `tell application "System Events" to tell (first process whose unix id is ${pid}) to set value of attribute "AXFullScreen" of window 1 to ${on}`])
  await sleep(3500)
}

async function attach() {
  const targets = await (await fetch(`http://127.0.0.1:${PORT}/json`)).json()
  const t = targets.find(x => x.type === 'page' && x.url.includes('index.html'))
  if (!t) throw new Error('No app window: start the demo app first')
  const ws = new WebSocket(t.webSocketDebuggerUrl)
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = rej })
  let id = 0
  const waiting = new Map()
  const errors = []
  ws.onmessage = e => {
    const m = JSON.parse(e.data)
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)(m); waiting.delete(m.id) }
    else if (m.method === 'Runtime.exceptionThrown') errors.push(m.params.exceptionDetails.exception?.description ?? m.params.exceptionDetails.text)
    else if (m.method === 'Runtime.consoleAPICalled' && m.params.type === 'error') errors.push(m.params.args.map(a => a.value ?? a.description).join(' '))
  }
  const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; waiting.set(i, r => (r.error ? rej(new Error(r.error.message)) : res(r.result))); ws.send(JSON.stringify({ id: i, method, params })) })
  const evaluate = async expression => {
    const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    if (r.exceptionDetails) throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text)
    return r.result.value
  }
  await send('Runtime.enable')
  return { send, evaluate, errors, close: () => ws.close() }
}

const CLICKABLE = 'button,[role=button],[role=tab],[role=menuitem],[role=option],a,label'
async function mouse(p, pt) { if (pt) for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) await p.send('Input.dispatchMouseEvent', { type, ...pt, button: 'left', clickCount: 1 }); return !!pt }
const click = (p, text, nth = 0) => p.evaluate(`(() => { const el=[...document.querySelectorAll(${JSON.stringify(CLICKABLE)})].filter(e=>e.offsetParent!==null&&e.textContent.trim().toLowerCase().includes(${JSON.stringify(text.toLowerCase())}))[${nth}]; if(!el) return null; el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`).then(pt => mouse(p, pt))
const clickExact = (p, text, nth = 0) => p.evaluate(`(() => { const el=[...document.querySelectorAll(${JSON.stringify(CLICKABLE)})].filter(e=>e.offsetParent!==null&&e.textContent.trim().toLowerCase()===${JSON.stringify(text.toLowerCase())})[${nth}]; if(!el) return null; el.scrollIntoView({block:'center'}); const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`).then(pt => mouse(p, pt))
const clickRow = (p, text) => p.evaluate(`(() => { const row=[...document.querySelectorAll('tr')].find(r=>r.textContent.includes(${JSON.stringify(text)})); if(!row) return null; row.scrollIntoView({block:'center'}); const td=row.querySelectorAll('td')[3]||row.querySelectorAll('td')[1]; const r=td.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`).then(pt => mouse(p, pt))
const clickInput = (p, value) => p.evaluate(`(() => { const el=[...document.querySelectorAll('input')].find(e=>e.offsetParent!==null&&(e.value||'').includes(${JSON.stringify(value)})); if(!el) return null; const r=el.getBoundingClientRect(); return {x:r.x+r.width/2,y:r.y+r.height/2} })()`).then(pt => mouse(p, pt))
// The scrollable region with the most overflow (a Settings page, the Agent thread): scrolled to an offset or its end.
const scroll = (p, to) => p.evaluate(`(() => { const s=[...document.querySelectorAll('*')].filter(e=>e.scrollHeight>e.clientHeight+100&&['auto','scroll'].includes(getComputedStyle(e).overflowY)&&e.clientHeight>300).sort((a,b)=>b.scrollHeight-a.scrollHeight)[0]; if(s) s.scrollTop=${to === 'end' ? 's.scrollHeight' : Number(to)}; return !!s })()`)
const settle = async p => { for (let i = 0; i < 20; i++) { if (!(await p.evaluate(`!!document.querySelector('[aria-busy=true],.animate-pulse,[class*=skeleton]')`))) break; await sleep(400) } await sleep(700) }

const JOB = 'Senior Backend Engineer, Data Platform'
const toJob = [['c', 'Jobs'], ['w', 1200], ['row', JOB], ['w', 2500]]
// name, legacy (dark file keeps the pre-existing README name), light variant?, steps
const SHOTS = [
  { name: 'overview', steps: [['c', 'Overview'], ['w', 1500]] },
  { name: 'jobs', legacy: true, steps: [['c', 'Jobs'], ['w', 1500]] },
  { name: 'job', steps: toJob },
  { name: 'job-match', steps: [...toJob, ['x', 'Match'], ['w', 1500]] },
  { name: 'job-report', themes: ['dark'], steps: [...toJob, ['x', 'Report'], ['w', 1500]] },
  { name: 'knowledge-base', steps: [...toJob, ['x', 'Knowledge base'], ['w', 2000]] },
  { name: 'boards', steps: [['c', 'Boards'], ['w', 1200], ['c', 'Boards 38'], ['w', 600], ['c', 'Browser 15'], ['w', 1200]] },
  { name: 'scans', themes: ['dark'], steps: [['c', 'Boards'], ['w', 1200], ['c', 'Scans'], ['w', 1500]] },
  { name: 'resume', steps: [['c', 'Resume'], ['w', 2500], ['nth', 'Overview', 1], ['w', 800]] },
  { name: 'resume-content', themes: ['dark'], steps: [['c', 'Resume'], ['w', 1500], ['x', 'Content'], ['w', 3000]] },
  { name: 'agent', legacy: true, steps: [['c', 'Agent'], ['w', 1500], ['c', 'Which of my applications'], ['w', 2000], ['scroll', 'end']] },
  { name: 'runs', steps: [['c', 'Runs'], ['w', 1500], ['c', 'Scan all portals'], ['w', 1500]] },
  { name: 'monitoring', legacy: true, steps: [['c', 'Monitoring'], ['w', 3000]] },
  { name: 'copilot-sessions', themes: ['dark'], steps: [['c', 'Copilot'], ['w', 1500], ['x', 'Sessions'], ['w', 2500]] },
  { name: 'settings-runners', themes: ['dark'], steps: [['c', 'Settings'], ['w', 800], ['x', 'Runners & models'], ['w', 2000], ['scroll', 'end']] },
  { name: 'settings-keys', themes: ['dark'], steps: [['c', 'Settings'], ['w', 800], ['x', 'API keys'], ['w', 2000]] },
  { name: 'settings-models', themes: ['dark'], steps: [['c', 'Settings'], ['w', 800], ['nth', 'Copilot', 1], ['w', 2500], ['scroll', 1700], ['w', 600], ['exact', 'Change…'], ['w', 2500]] },
  { name: 'integrations', legacy: true, themes: ['dark'], steps: [['c', 'Settings'], ['w', 800], ['x', 'Integrations'], ['w', 1500], ['x', 'Refresh'], ['w', 3000]] },
]

async function run(p, step) {
  const [k, a, b] = step
  const ok = k === 'c' ? await click(p, a) : k === 'x' ? await clickExact(p, a, 0) : k === 'nth' ? await clickExact(p, a, b) : k === 'exact' ? await clickExact(p, a) : k === 'row' ? await clickRow(p, a) : k === 'input' ? await clickInput(p, a) : k === 'scroll' ? await scroll(p, a) : k === 'w' ? (await sleep(a), true) : false
  if (!ok) throw new Error(`step failed: ${step.join(' ')}`)
  if (k !== 'w') await sleep(500)
}

fs.mkdirSync(OUT, { recursive: true })
const p = await attach()
// Full-screen window at the display's real size (no viewport override); --viewport keeps the old fixed 1440x900 at 2x.
if (process.argv.includes('--viewport')) await p.send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 2, mobile: false })
else {
  await setFullScreen(true)
  console.log('viewport', await p.evaluate('`${innerWidth}x${innerHeight}@${devicePixelRatio}`'))
}
const report = []
for (const theme of THEMES) {
  await p.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: theme }] })
  await sleep(600)
  for (const shot of SHOTS) {
    if ((shot.themes && !shot.themes.includes(theme)) || (ONLY && !ONLY.includes(shot.name))) continue
    for (const step of shot.steps) await run(p, step)
    await settle(p)
    const text = await p.evaluate('document.body.innerText')
    const leak = text.match(FORBIDDEN)
    const file = path.join(OUT, `${shot.name}${shot.legacy && theme === 'dark' ? '' : `-${theme}`}.png`)
    fs.writeFileSync(file, Buffer.from((await p.send('Page.captureScreenshot', { format: 'png' })).data, 'base64'))
    report.push({ file: path.basename(file), leak: leak ? leak[0] : null, bytes: fs.statSync(file).size })
    console.log(path.basename(file), leak ? `LEAK: ${leak[0]}` : 'clean')
  }
}
if (!process.argv.includes('--viewport')) await setFullScreen(false)
console.log('console errors:', p.errors.length ? p.errors : 'none')
fs.writeFileSync(path.join(OUT, 'report.json'), JSON.stringify({ report, errors: p.errors }, null, 2))
p.close()
