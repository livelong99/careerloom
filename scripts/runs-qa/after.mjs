// QA only: drives the new Runs page in the real app (cloned profile, fake zero-cost scan script). Results -> $EV_DIR/results.jsonl.
import { attach, sleep, waitTarget } from '../copilot-int-e2e/cdp.mjs'
import { realClick } from '../layout-qa/click.mjs'
import { record, SENTINEL } from '../settings-qa/lib.mjs'

const OUT = process.env.EV_DIR
const page = await attach(await waitTarget(t => t.url.includes('index.html')))
await page.send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 860, deviceScaleFactor: 1, mobile: false })
await sleep(1500)
const text = () => page.evaluate('document.body.innerText')
const theme = t => page.evaluate(`(() => { document.documentElement.dataset.theme = ${JSON.stringify(t)}; localStorage.setItem('careerloom.theme', ${JSON.stringify(t)}) })()`)
const nav = d => page.evaluate(`window.dispatchEvent(new CustomEvent('careerloom:navigate', { detail: ${JSON.stringify(d)} }))`)
const VK = { Home: 36, End: 35, ArrowDown: 40, ArrowUp: 38, Escape: 27 }
const key = async (k, extra = {}) => { for (const type of ['rawKeyDown', 'keyUp']) await page.send('Input.dispatchKeyEvent', { type, key: k, code: k, windowsVirtualKeyCode: VK[k], ...extra }) }
const selected = () => page.evaluate(`document.querySelector('[id^=run-opt-][aria-selected=true]')?.textContent ?? null`)
const rows = () => page.evaluate(`document.querySelectorAll('[id^=run-opt-]').length`)
const logRows = () => page.evaluate(`document.querySelector('[role=log]')?.querySelectorAll('.absolute').length ?? -1`)
const heading = () => page.evaluate(`document.querySelector('section[aria-label^="Run "] h2')?.textContent ?? null`)
const leak = () => page.evaluate(`document.documentElement.outerHTML.includes('QASENTINEL') || JSON.stringify({ ...localStorage, ...sessionStorage }).includes('QASENTINEL')`)

// 1. nav: sidebar item, ⌘7, title
const sb = await page.evaluate(`[...document.querySelectorAll('nav .ni')].map(n => n.title)`)
record('sidebar-runs-item', 'nav', sb.some(t => /^Runs ⌘7|^Runs Ctrl\+7/.test(t)), JSON.stringify(sb.filter(t => /Runs|Monitoring/.test(t))))
await nav({ section: 'overview' }); await sleep(500)
await key('7', { modifiers: 4, code: 'Digit7' }); await sleep(800)
record('shortcut-cmd-7', 'nav', (await text()).includes('Run totals') || (await page.evaluate(`document.querySelector('h1.t')?.textContent`)) === 'Runs', await page.evaluate(`document.querySelector('h1.t')?.textContent`))

// 2. a live run: fake scan (zero cost)
await page.evaluate(`(async () => { const p = (await window.careerloom.listPortals()).find(x => x.name === 'QA Fake Co'); await window.careerloom.scanPortals([p.id]) })()`)
for (let i = 0; i < 20 && !/\[008\]/.test(await page.evaluate(`document.querySelector('[role=log]')?.textContent ?? ''`)); i++) await sleep(1000)
const first = await selected()
record('running-run-first-and-selected', 'live', /Scan QA Fake Co/.test(first ?? '') && /running/i.test(first ?? ''), first?.slice(0, 80))
const e1 = await page.evaluate(`[...document.querySelectorAll('dt')].find(d => /Elapsed/.test(d.textContent))?.nextSibling?.textContent`)
await sleep(3000)
const e2 = await page.evaluate(`[...document.querySelectorAll('dt')].find(d => /Elapsed/.test(d.textContent))?.nextSibling?.textContent`)
record('elapsed-ticks', 'live', !!e1 && e1 !== e2, `${e1} -> ${e2}`)
const live = await page.evaluate(`document.querySelector('[role=log]')?.textContent ?? ''`)
record('live-log-streams', 'live', /fetched board page/.test(live), live.slice(0, 60))
record('live-log-redacted', 'secrets', !/QASENTINEL/.test(live) && (live.match(/line hidden/g) ?? []).length === 1 && /sk-…/.test(live), `credential line hidden + bare key masked; hidden=${(live.match(/line hidden/g) ?? []).length} leak=${await leak()}`)
await page.shot(`${OUT}/after-live-run-dark.png`)

// 3. big saved log: windowing, steps, jump
await nav({ section: 'runs', id: 'qa-big-scan' }); await sleep(1500)
record('deeplink-selects-run', 'nav', /big log/.test((await selected()) ?? '') && /big log/.test((await heading()) ?? ''), await heading())
const t3 = await text()
await page.evaluate(`document.querySelector('[role=log]').scrollTop = 30 * 18`); await sleep(400)
const t3b = await page.evaluate(`document.querySelector('[role=log]').textContent`)
record('big-log-1600-lines', 'log', /1,600 lines/.test(t3), `domRows=${await logRows()}`)
record('big-log-windowed', 'log', (await logRows()) > 0 && (await logRows()) < 200, `domRows=${await logRows()}`)
record('big-log-redacted', 'secrets', !/QASENTINEL/.test(t3 + t3b) && (t3b.match(/line hidden/g) ?? []).length === 1 && /sk-…/.test(t3b), `credential line hidden + bare key masked; leak=${await leak()}`)
await page.evaluate(`[...document.querySelectorAll('ol[aria-label=Steps] button')].find(b => /Bash node scan/.test(b.textContent))?.click()`); await sleep(600)
const seen = await page.evaluate(`document.querySelector('[role=log]')?.textContent ?? ''`)
record('step-jump', 'log', /Bash node scan\.mjs/.test(seen), 'timeline step scrolled the viewer to line 501')
await page.evaluate(`[...document.querySelectorAll('button')].find(b => b.textContent === 'Follow tail')?.click()`); await sleep(600)
const tail = await page.evaluate(`document.querySelector('[role=log]')?.textContent ?? ''`)
record('follow-tail-bottom', 'log', /1,?600|done · 1,600/.test(tail) || /\n?1600/.test(tail), tail.slice(-40).replace(/\n/g, ' '))
await theme('dark'); await sleep(300); await page.shot(`${OUT}/after-big-log-dark.png`)
await theme('light'); await sleep(300); await page.shot(`${OUT}/after-big-log-light.png`)
await theme('dark')

// 4. filters + failed run
await nav({ section: 'runs', id: 'qa-failed-scan' }); await sleep(1000)
record('deeplink-failed-run', 'nav', /failed/.test((await selected()) ?? '') && /Scan 3 portals/.test((await heading()) ?? ''), await heading())
const total = await rows()
await realClick(page, 'Status'); await sleep(900)
await realClick(page, 'failed', '[data-slot=select-item]'); await sleep(900)
const failedOnly = await page.evaluate(`[...document.querySelectorAll('[id^=run-opt-]')].every(o => /failed/.test(o.textContent))`)
record('filter-status-failed', 'filter', failedOnly && (await rows()) > 0 && (await rows()) < total, `${await rows()} of ${total}`)
await page.shot(`${OUT}/after-failed-filter-dark.png`)
await realClick(page, 'Clear filters'); await sleep(300)
await realClick(page, 'Clear filters'); await sleep(300)
await page.evaluate(`(() => { const i = document.querySelector('input[type=search]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'big log'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`); await sleep(500)
record('filter-search', 'filter', (await rows()) === 1, `rows=${await rows()}`)
await realClick(page, 'Clear filters'); await sleep(300)

// 5. keyboard nav
await page.evaluate(`document.querySelector('[role=listbox]').focus()`)
await key('Home'); await sleep(200); const h = await selected()
await key('ArrowDown'); await sleep(200); const d = await selected()
record('keyboard-nav', 'a11y', !!h && !!d && h !== d, `${h?.slice(0, 30)} -> ${d?.slice(0, 30)}`)
const aria = await page.evaluate(`({ roles: ['listbox','option','log','group'].map(r => !!document.querySelector('[role='+r+']')), active: !!document.querySelector('[role=listbox]').getAttribute('aria-activedescendant') })`)
record('a11y-roles', 'a11y', aria.roles.every(Boolean) && aria.active, JSON.stringify(aria))

// 6. palette entry + settings chip
await key('k', { modifiers: 4, code: 'KeyK' }); await sleep(600)
await page.send('Input.insertText', { text: 'Runs' }); await sleep(500)
record('palette-runs-entry', 'nav', await page.evaluate(`[...document.querySelectorAll('[cmdk-item]')].some(i => /Runs/.test(i.textContent))`), 'Go to > Runs')
await key('Escape'); await sleep(300)

// 7. Stop a live run (start a fresh fake scan first; the first one has finished by now)
await page.evaluate(`(async () => { const p = (await window.careerloom.listPortals()).find(x => x.name === 'QA Fake Co'); await window.careerloom.scanPortals([p.id]) })()`)
await nav({ section: 'runs' }); await sleep(2500)
await page.evaluate(`[...document.querySelectorAll('[id^=run-opt-]')].find(o => /running/.test(o.textContent))?.click()`); await sleep(400)
const stopped = await realClick(page, 'Stop'); await sleep(2500)
const st = await page.evaluate(`document.querySelector('section[aria-label^="Run "] .run-status')?.textContent`)
record('stop-running-run', 'actions', stopped && st === 'cancelled', `status=${st}`)

// 8. delete one run (confirm), count drops, history file shrinks
const before = await rows()
await page.evaluate(`[...document.querySelectorAll('[id^=run-opt-]')].find(o => /done/.test(o.textContent) && !/big log/.test(o.textContent)).click()`); await sleep(300)
await realClick(page, 'Delete'); await sleep(500)
const cancelOk = await realClick(page, 'Cancel'); await sleep(300)
record('delete-confirm-cancel-keeps', 'actions', cancelOk && (await rows()) === before, `rows=${await rows()}`)
await realClick(page, 'Delete'); await sleep(500)
await realClick(page, 'Delete run'); await sleep(1200)
record('delete-run', 'actions', (await rows()) === before - 1, `${before} -> ${await rows()}`)

// 9. retention chip -> Settings > Monitoring
await realClick(page, 'Manage Log retention in Settings'); await sleep(1200)
record('retention-chip', 'nav', /Monitoring/.test(await page.evaluate(`document.querySelector('h1.t')?.textContent + ' ' + document.body.innerText.slice(0, 600)`)) && /retention/i.test(await text()), 'Settings > Monitoring')

// 10. final: dark+light of the page, and one more leak sweep
await nav({ section: 'runs', id: 'qa-failed-scan' }); await sleep(1200)
for (const t of ['dark', 'light']) { await theme(t); await sleep(400); await page.shot(`${OUT}/after-runs-${t}.png`) }
await theme('dark')
record('no-secret-anywhere', 'secrets', !(await leak()), 'DOM + web storage after all views')
console.log('after QA done')
process.exit(0)
