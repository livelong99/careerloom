// QA only: key manager flows with FAKE sentinel keys (test hits the provider's 401 path, no spend).
import { clickText, done, nav, open, record, sentinelLeak, sleep, SENTINEL, text, type, waitText } from './lib.mjs'

const page = await open()
const EV = process.env.EV_DIR
await nav(page, { section: 'settings', page: 'keys' }); await sleep(1200)
const row = `[data-setting-id="key:openrouter"]`
const rowText = () => page.evaluate(`document.querySelector('${row}')?.innerText ?? ''`)
const clickIn = (label, exact = true) => page.evaluate(`(() => { const b = [...document.querySelectorAll('${row} button, [role=alertdialog] button')].find(e => ${exact ? `e.textContent.trim() === ${JSON.stringify(label)}` : `e.textContent.includes(${JSON.stringify(label)})`}); if (!b || b.disabled) return false; b.click(); return true })()`)
record('keys-initial-not-set', 'keys', /Not set/.test(await rowText()), (await rowText()).replace(/\n/g, ' | ').slice(0, 120))

// add
await clickIn('Add key'); await sleep(400)
await type(page, `${row} input[type=password]`, SENTINEL)
const typedMasked = await page.evaluate(`document.querySelector('${row} input').type`)
await page.shot(`${EV}/keys-add-typed-dark.png`)
await clickIn('Save key'); await sleep(1500)
let t = await rowText()
record('keys-add-saved-masked', 'keys', /Saved/.test(t) && t.includes('••••' + SENTINEL.slice(-4)) && !t.includes(SENTINEL) && typedMasked === 'password', t.replace(/\n/g, ' | ').slice(0, 140))
record('keys-input-cleared-after-save', 'keys', (await page.evaluate(`!!document.querySelector('${row} input')`)) === false)
await page.shot(`${EV}/keys-saved-dark.png`)

// test (401 path)
await clickIn('Test'); await waitText(page, 'tested', 20000)
t = await rowText()
record('keys-test-401', 'keys', /tested/.test(t) && !/ok ·/.test(t), t.replace(/\n/g, ' | ').slice(-140))
await page.shot(`${EV}/keys-test-fail-dark.png`)

// replace
const NEW = 'sk-or-QASENTINEL-REPLACED-wxyz'
await clickIn('Replace'); await sleep(400)
await type(page, `${row} input[type=password]`, NEW)
await page.evaluate(`document.querySelector('${row} input').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`); await sleep(400)
record('keys-replace-escape-cancels', 'keys', !(await page.evaluate(`!!document.querySelector('${row} input')`)) && (await rowText()).includes('••••' + SENTINEL.slice(-4)), 'Esc discards typed value, old key kept')
await clickIn('Replace'); await sleep(400)
await type(page, `${row} input[type=password]`, NEW); await clickIn('Save key'); await sleep(1500)
record('keys-replace', 'keys', (await rowText()).includes('••••wxyz'), (await rowText()).replace(/\n/g, ' | ').slice(0, 100))

// remove with confirm
await clickIn('Remove'); await sleep(500)
const dlg = await page.evaluate(`document.querySelector('[role=alertdialog]')?.innerText ?? ''`)
await page.shot(`${EV}/keys-remove-confirm-dark.png`)
record('keys-remove-confirm-dialog', 'keys', /will stop working/.test(dlg), dlg.replace(/\n/g, ' | ').slice(0, 140))
await clickIn('Cancel'); await sleep(400)
record('keys-remove-cancel-keeps', 'keys', /Saved/.test(await rowText()))
await clickIn('Remove'); await sleep(400)
await page.evaluate(`[...document.querySelectorAll('[role=alertdialog] button')].find(e => /^Remove/.test(e.textContent.trim()) || /Delete/.test(e.textContent))?.click()`); await sleep(1500)
record('keys-remove', 'keys', /Not set/.test(await rowText()), (await rowText()).replace(/\n/g, ' | ').slice(0, 100))

// renderer never holds the secret
const leak = await sentinelLeak(page)
record('keys-no-secret-in-renderer', 'keys', leak.length === 0, leak.join(',') || 'DOM, localStorage, sessionStorage clean')
done()
