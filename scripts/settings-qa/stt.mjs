// QA only: Settings > Copilot > Transcription defers STT install to Settings > Local models.
import { done, nav, open, record, sleep } from './lib.mjs'
const page = await open()
await nav(page, { section: 'settings', page: 'copilot', focus: 'copilot:stt' }); await sleep(2000)
const s = await page.evaluate(`({ install: [...document.querySelectorAll('button')].some(b => /Install speech model/.test(b.textContent)), chip: !!document.querySelector('[aria-label="Manage Speech model in Settings"]') })`)
await page.shot(`${process.env.EV_DIR}/copilot-stt-chip-light.png`)
await page.evaluate(`document.querySelector('[aria-label="Manage Speech model in Settings"]')?.click()`); await sleep(1500)
const at = await page.evaluate(`({ tab: document.querySelector('[role=tab][aria-selected=true]')?.textContent?.trim(), target: !!document.querySelector('[data-setting-id="stt-models"]'), pulse: document.querySelector('[data-setting-id="stt-models"]')?.classList.contains('ring-2') })`)
record('copilot-stt-install-defers', 'deep link', !s.install && s.chip && at.tab === 'Local models' && at.target, JSON.stringify({ ...s, ...at }))
done()
