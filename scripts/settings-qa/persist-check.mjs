// QA only: after a restart, the settings changed in persist-set.mjs are still there; then the reset flows (clone only).
import fs from 'node:fs'
import { done, nav, open, record, sleep, text } from './lib.mjs'
const page = await open()
const EV = process.env.EV_DIR, PROFILE = process.env.QA_PROFILE
const go = async p => { await nav(page, { section: 'settings', page: p }); await sleep(1500) }
const ls = k => page.evaluate(`localStorage.getItem(${JSON.stringify(k)})`)
const prefs = () => page.evaluate(`window.careerloom.prefsGet()`)
const settings = () => page.evaluate(`window.careerloom.getSettings()`)
const click = label => page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim().startsWith(${JSON.stringify(label)}) && !e.disabled); if (!b) return false; b.click(); return true })()`)

await go('general')
const p = await prefs()
record('restart-theme', 'persistence', (await ls('careerloom.theme')) === 'light' && (await page.evaluate(`document.documentElement.dataset.theme`)) === 'light')
record('restart-language', 'persistence', (await ls('careerloom.locale')) === 'fr', `locale=${await ls('careerloom.locale')} lang=${await page.evaluate('document.documentElement.lang')}`)
record('restart-refresh-cadence', 'persistence', (await ls('careerloom.refreshInterval')) === '5m')
record('restart-updates-opt-out', 'persistence', p.updates.enabled === false)
record('restart-doc-defaults', 'persistence', p.docs.tone === 'formal')
await page.shot(`${EV}/persist-after-restart-light.png`)

// reset preferences (Advanced)
const before = await settings()
await go('advanced')
await click('Reset preferences'); await sleep(600)
await page.shot(`${EV}/reset-prefs-confirm-light.png`)
await page.evaluate(`[...document.querySelectorAll('[role=alertdialog] button')].find(e => /^Reset preferences/.test(e.textContent.trim()))?.click()`)
await sleep(3500)
const after = await settings(); const p2 = await prefs()
record('reset-preferences', 'reset', p2.updates.enabled === true && p2.docs.tone === 'warm' && after.root === before.root && after.runner === before.runner, `updates=${p2.updates.enabled} tone=${p2.docs.tone} root kept=${after.root === before.root} runner kept=${after.runner === before.runner}`)
record('reset-preferences-view-state', 'reset', (await ls('careerloom.theme')) !== 'light', `theme after reset=${await ls('careerloom.theme')} locale=${await ls('careerloom.locale')} cadence=${await ls('careerloom.refreshInterval')}`)

// reset everything (typed confirm) with a fake key present
await page.evaluate(`window.careerloom.keysSet('openrouter', 'sk-or-QASENTINEL-RESETME-0001')`)
await go('advanced')
await click('Reset everything'); await sleep(600)
const dlg = await page.evaluate(`document.querySelector('[role=alertdialog]')?.innerText ?? ''`)
const gated = await page.evaluate(`(() => { const b = [...document.querySelectorAll('[role=alertdialog] button')].find(e => /^Reset everything/.test(e.textContent.trim())); return b?.disabled })()`)
record('reset-everything-typed-confirm-gate', 'reset', gated === true && /type/i.test(dlg), dlg.replace(/\n/g, ' | ').slice(0, 150))
await page.shot(`${EV}/reset-everything-confirm-light.png`)
const word = await page.evaluate(`document.querySelector('[role=alertdialog] input')?.getAttribute('placeholder')`)
await page.evaluate(`document.querySelector('[role=alertdialog] input').focus()`)
await page.send('Input.insertText', { text: String(word).replace(/^Type | to confirm$/g, '') }); await sleep(300)
await page.evaluate(`[...document.querySelectorAll('[role=alertdialog] button')].find(e => /^Reset everything/.test(e.textContent.trim()))?.click()`)
await sleep(3500)
const keys = await page.evaluate(`window.careerloom.keysList()`)
const s3 = await settings()
record('reset-everything', 'reset', keys.every(k => !k.hasKey) && s3.root === before.root && s3.runner === before.runner && fs.existsSync(`${PROFILE}/settings.json`), `keys left=${keys.filter(k => k.hasKey).length} root kept=${s3.root === before.root} runner kept=${s3.runner === before.runner}`)
record('career-ops-folder-untouched', 'reset', fs.existsSync(`${s3.root}/package.json`) || fs.existsSync(`${s3.root}/AGENTS.md`), s3.root)
done()
