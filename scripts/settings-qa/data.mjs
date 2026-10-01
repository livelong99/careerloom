// QA only: Data page (locations, retention + prune), update opt-out, Local models / Runners status, resets. Cloned profile only.
import fs from 'node:fs'
import { done, nav, open, record, sleep, text, waitText } from './lib.mjs'

const page = await open()
const EV = process.env.EV_DIR
const PROFILE = process.env.QA_PROFILE
const go = async (p, focus) => { await nav(page, { section: 'settings', page: p, focus }); await sleep(1500) }
const click = (label, scope = 'body') => page.evaluate(`(() => { const b = [...document.querySelectorAll(${JSON.stringify(scope + ' button')})].find(e => e.textContent.trim() === ${JSON.stringify(label)} && !e.disabled); if (!b) return false; b.click(); return true })()`)
const toast = () => page.evaluate(`document.querySelector('.toast')?.innerText ?? ''`)
const prefs = () => page.evaluate(`window.careerloom.prefsGet()`)

// locations
await go('data')
const t = await text(page)
record('data-locations-listed', 'data', /Locations/.test(t) && t.includes(PROFILE) && t.includes('career-ops'), 'user-data folder + career-ops root shown (clone paths)')
await page.shot(`${EV}/data-dark.png`)
const revealed = await page.evaluate(`(() => { const b = [...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Show in Finder'); b?.click(); return !!b })()`); await sleep(1200)
record('data-show-in-finder', 'data', revealed && !/not a data location|error/i.test(await toast()), `toast="${await toast()}"`)
await page.evaluate(`window.careerloom.revealPath('/etc').then(() => 'allowed', e => 'refused: ' + e.message)`).then(r => record('data-reveal-refuses-unlisted-path', 'data', /refused/.test(r), r))

// retention + undo + prune
const files = () => fs.readdirSync(`${PROFILE}/run-logs`).length
const before = files()
await page.evaluate(`window.careerloom.prefsSet({ retention: { runLogDays: null } })`)
await go('data', 'retention')
const prune0 = await page.evaluate(`[...document.querySelectorAll('button')].find(e => e.textContent.trim() === 'Prune now')?.disabled`)
record('retention-prune-disabled-when-forever', 'data', prune0 === true)
await page.evaluate(`document.querySelector('#settings-retention').click()`); await sleep(400)
await page.evaluate(`[...document.querySelectorAll('[role=option]')].find(o => o.textContent.trim() === '30 days')?.click()`); await sleep(900)
record('retention-set-30-undo-toast', 'data', (await prefs()).retention.runLogDays === 30 && /Undo/.test(await toast()), `days=${(await prefs()).retention.runLogDays} toast="${(await toast()).replace(/\n/g, ' ')}"`)
await page.shot(`${EV}/data-retention-undo-dark.png`)
await page.evaluate(`document.querySelector('.toast button')?.click()`); await sleep(900)
record('retention-undo', 'data', (await prefs()).retention.runLogDays === null, `days=${(await prefs()).retention.runLogDays}`)
await page.evaluate(`window.careerloom.prefsSet({ retention: { runLogDays: 30 } })`); await go('data', 'retention')
await click('Prune now'); await sleep(1200)
record('retention-prune', 'data', files() === before - 3 && fs.existsSync(`${PROFILE}/run-logs/qa-fresh.log`), `files ${before} → ${files()} (3 old removed, fresh kept) toast="${await toast()}"`)
await page.evaluate(`window.careerloom.prefsSet({ retention: { runLogDays: null } })`)

// update opt-out
await go('general', 'updates')
await page.evaluate(`document.querySelector('[aria-label="Check for updates"]').click()`); await sleep(900)
record('updates-opt-out', 'general', (await prefs()).updates.enabled === false && /Undo/.test(await toast()), `enabled=${(await prefs()).updates.enabled}`)
await page.evaluate(`document.querySelector('.toast button')?.click()`); await sleep(700)
record('updates-opt-out-undo', 'general', (await prefs()).updates.enabled === true)

// runners readiness
await go('runners')
const r = await text(page)
record('runners-readiness', 'runners', /Claude Code/.test(r) && /(Ready|Needs setup|Not installed|Signed)/i.test(r), r.split('\n').filter(l => /Claude|Codex|Ready|Not installed|Needs/.test(l)).slice(0, 6).join(' | '))
await page.shot(`${EV}/runners-dark.png`)
// local models
await go('local-models')
const m = await text(page)
record('local-models-status', 'local-models', /Memory/.test(m) && /Pre-screen model/.test(m) && /Transcription engines/.test(m), m.split('\n').filter(l => /GB|Installed|Not installed|Base model|Personal/.test(l)).slice(0, 4).join(' | '))
await go('advanced')
await page.shot(`${EV}/advanced-dark.png`)
const adv = await text(page)
record('advanced-diagnostics', 'advanced', /Diagnostics|Report/i.test(adv), '')
done()
