// QA only: every registry entry's focus id must exist in the DOM of its page (so search/palette can pulse it).
import { REGISTRY } from '../../renderer/components/settings/settings-registry.ts'
import { done, nav, open, record, sleep } from './lib.mjs'

const page = await open()
await page.send('Page.reload'); await sleep(2500)
const missing = []
for (const en of REGISTRY) {
  await nav(page, { section: 'settings', page: en.page }); await sleep(1200)
  if (!en.focus) continue
  let ok = false
  for (let i = 0; i < 6 && !ok; i++) { ok = await page.evaluate(`!!document.querySelector('[data-setting-id=${JSON.stringify(en.focus)}]')`); if (!ok) await sleep(500) }
  if (!ok) missing.push(`${en.page}:${en.focus}`)
}
record('registry-ids-exist', 'search', missing.length === 0, missing.length ? `missing ${missing.join(', ')}` : `${REGISTRY.length} entries`)
done()
