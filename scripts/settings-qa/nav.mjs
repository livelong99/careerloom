// QA only: search, deep links, shortcuts, palette, legacy remap.
import { clickText, key, nav, open, record, sleep, text, type, waitText } from './lib.mjs'

const page = await open()
await page.send('Page.reload'); await sleep(2500)
const pulsed = id => page.evaluate(`!!document.querySelector('[data-setting-id=${JSON.stringify(id)}]')?.classList.contains('ring-2')`)
const activePage = () => page.evaluate(`document.querySelector('[role=tab][aria-selected=true]')?.textContent?.trim() ?? null`)
const section = () => page.evaluate(`localStorage.getItem('careerloom.section')`)

// ⌘, shortcut
await nav(page, 'overview'); await sleep(600)
await key(page, ',', 4, { code: 'Comma', windowsVirtualKeyCode: 188 }); await sleep(800)
record('shortcut-cmd-comma', 'nav', (await section()) === 'settings', `section=${await section()}`)

// search → control pulse
await nav(page, { section: 'settings', page: 'general' }); await sleep(800)
await type(page, '[data-settings-search] input', 'retention'); await sleep(500)
const hits = await page.evaluate(`[...document.querySelectorAll('[data-settings-search] [cmdk-item]')].map(e => e.textContent)`)
await key(page, 'Enter', 0, { code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(900)
record('search-retention', 'search', hits.length > 0 && /Data|Monitoring/.test(await activePage()), `hits=${JSON.stringify(hits)} page=${await activePage()}`)
await page.evaluate(`document.querySelector('[data-settings-search] input').value = ''`)
for (const [q, want] of [['theme', 'General'], ['openrouter', 'API keys'], ['firecrawl', 'Integrations'], ['panic', 'Copilot'], ['reset', 'Advanced|Data']]) {
  await nav(page, { section: 'settings', page: 'monitoring' }); await sleep(500)
  await type(page, '[data-settings-search] input', q); await sleep(400)
  await key(page, 'Enter', 0, { code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(900)
  const p = await activePage()
  record(`search-${q}`, 'search', new RegExp(want).test(p), `→ ${p}`)
}

// deep links with pulse
for (const [page_, focus] of [['general', 'theme'], ['general', 'refresh'], ['jobs', 'prescreen'], ['copilot', 'copilot:stt'], ['copilot', 'copilot:privacy'], ['keys', 'key:openrouter'], ['runners', 'runner:claude'], ['data', 'danger'], ['local-models', 'stt-models']]) {
  await nav(page, { section: 'settings', page: page_ }); await sleep(300)
  await nav(page, { section: 'settings', page: page_, focus }); await sleep(900)
  record(`deeplink-${page_}-${focus}`, 'deep link', await pulsed(focus) || await page.evaluate(`!!document.querySelector('[data-setting-id=${JSON.stringify(focus)}]')`), `pulsed=${await pulsed(focus)}`)
}
await page.shot(`${process.env.EV_DIR}/deeplink-pulse-dark.png`)

// legacy integrations remap
await page.evaluate(`localStorage.setItem('careerloom.section', 'integrations'); localStorage.removeItem('careerloom.settingsPage')`)
await page.send('Page.reload'); await sleep(2500)
record('legacy-integrations-remap', 'deep link', (await activePage()) === 'Integrations', `page=${await activePage()}`)

// command palette
await nav(page, 'overview'); await sleep(500)
await key(page, 'k', 4, { code: 'KeyK', windowsVirtualKeyCode: 75 }); await sleep(600)
await type(page, '[cmdk-input]', 'settings: refresh'); await sleep(500)
const items = await page.evaluate(`[...document.querySelectorAll('[cmdk-item]')].map(e => e.textContent)`)
await page.shot(`${process.env.EV_DIR}/palette-dark.png`)
await key(page, 'Enter', 0, { code: 'Enter', windowsVirtualKeyCode: 13 }); await sleep(900)
record('palette-settings-entry', 'nav', items.some(i => /Settings: Refresh/i.test(i)) && (await activePage()) === 'General' && await pulsed('refresh'), `items=${JSON.stringify(items.slice(0, 3))} page=${await activePage()}`)

// other-screen chips
for (const [sec, label, expect] of [['jobs', /Manage Pre-screen policy in Settings/, 'Jobs & boards'], ['agent', /Manage Runner in Settings/, 'Runners & models'], ['copilot', /Manage Speech to text in Settings/, 'Copilot'], ['monitoring', /Manage Refresh in Settings/, 'General']]) {
  await nav(page, sec); await sleep(1500)
  const found = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(e => ${label}.test(e.getAttribute('aria-label') || '')); if (!b) return false; b.click(); return true })()`)
  await sleep(900)
  record(`chip-${sec}`, 'deep link', found && (await activePage()) === expect, `found=${found} page=${await activePage()}`)
}
await nav(page, 'boards'); await sleep(1500)
await page.shot(`${process.env.EV_DIR}/boards-dark.png`)
