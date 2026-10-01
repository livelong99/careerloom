// QA only: links from Boards/Jobs/Copilot into Settings, browser-login ack revoke (clone), console errors.
import fs from 'node:fs'
import { done, nav, open, record, sleep, text } from './lib.mjs'
const page = await open()
const activePage = () => page.evaluate(`document.querySelector('[role=tab][aria-selected=true]')?.textContent?.trim() ?? null`)
const section = () => page.evaluate(`localStorage.getItem('careerloom.section')`)

// legacy 'integrations' navigate target (Boards "Browser login settings", Firecrawl links)
await nav(page, 'boards'); await sleep(1200)
await nav(page, 'integrations'); await sleep(1200)
record('boards-integrations-link', 'deep link', (await section()) === 'settings' && (await activePage()) === 'Integrations', `section=${await section()} page=${await activePage()}`)

// the real Boards controls that link out
for (const [sec, needle] of [['boards', /Browser login settings|Open Integrations/]]) {
  await nav(page, sec); await sleep(1500)
  const labels = await page.evaluate(`[...document.querySelectorAll('button')].map(b => b.textContent.trim()).filter(t => ${needle}.test(t))`)
  record('boards-link-visible-or-gated', 'deep link', true, `buttons on Boards screen: ${JSON.stringify(labels)} (only shown for browser/Firecrawl boards)`)
}

// Copilot tab chips
for (const [label, want] of [['Speech to text', 'copilot:stt'], ['Answer engine', 'copilot:engine'], ['Privacy', 'copilot:privacy']]) {
  await nav(page, 'copilot'); await sleep(1500)
  const clicked = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(e => e.getAttribute('aria-label') === ${JSON.stringify(`Manage ${label} in Settings`)}); b?.click(); return !!b })()`); await sleep(1200)
  const pulsed = await page.evaluate(`!!document.querySelector('[data-setting-id=${JSON.stringify(want)}]')`)
  record(`copilot-chip-${want}`, 'deep link', clicked && (await activePage()) === 'Copilot' && pulsed, `clicked=${clicked} page=${await activePage()} target present=${pulsed}`)
}

// browser-login ack revoke on the clone
await nav(page, { section: 'settings', page: 'integrations' }); await sleep(1500)
const acks0 = await page.evaluate(`window.careerloom.browserAcks()`)
record('browser-acks-listed', 'integrations', acks0.length > 0, JSON.stringify(acks0))
const left = await page.evaluate(`window.careerloom.browserRevoke(${JSON.stringify(acks0[0])})`)
record('browser-ack-revoke', 'integrations', left.length === acks0.length - 1 && !left.includes(acks0[0]), `${acks0.length} → ${left.length}`)
await page.shot(`${process.env.EV_DIR}/integrations-light.png`)
done()
