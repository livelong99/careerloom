// Fast path for `fetch: browser` boards: Careerloom itself drives the user's Chrome/Edge (no agent, no tokens)
// through a read-only Page (navigate / scroll / evaluate), reads the job cards with its own extractors, and
// hands them to validateJobs. Anything unexpected throws FastFallback and the caller runs the agent instead;
// a login / captcha wall throws FastBlocked and the scan stops (no retry, no second attempt by an agent).
import type { PwCookie } from '../integrations/browser-cookies'
import { jsonLdJobs, MAX_PAGES, validateJobs, type WebJob } from '../integrations/web-board-core'
import { findBrowser, launchBrowser, type Launched } from './chrome'
import { genericExtract } from './generic'
import { openPage, type Page } from './page'
import { hasResults, scriptOf, siteFor, wallReason, type Doc, type RawJob, type Site } from './sites'

export class FastFallback extends Error {}
export class FastBlocked extends Error {}

export type FastDeps = {
  findBrowser: () => string | null
  launch: (bin: string, headless: boolean) => Promise<Launched>
  open: (wsUrl: string, domain: string, cookies: PwCookie[]) => Promise<Page>
  sleep: (ms: number) => Promise<void>
  random: () => number
}
const realDeps: FastDeps = { findBrowser, launch: launchBrowser, open: openPage, sleep: ms => new Promise(r => setTimeout(r, ms)), random: Math.random }

export type FastOptions = { domain: string; urls: string[]; cookies: PwCookie[]; headless: boolean; settleSeconds: number; maxPages?: number; log: (t: string) => void; cancelled?: () => boolean }

const PAUSE_MS = [3000, 8000] as const // between pages: a person's pace, not a crawler's
const MAX_SCROLLS = 12
const OVERALL_TIMEOUT_MS = 4 * 60_000

/** The tiers, in order: the board's own extractor, schema.org JSON-LD, the generic card finder. */
async function readPage(page: Page, site: Site | undefined, log: (t: string) => void): Promise<{ raw: RawJob[]; tier: string }> {
  if (site) {
    const raw = await page.evaluate<RawJob[]>(scriptOf(site.extract))
    if (raw.length) return { raw, tier: site.id }
    const looked = await page.evaluate<boolean>(hasResults(site.resultLinks))
    if (looked) log(`  extractor-stale:${site.id} — result links are there but no cards were read; trying the generic reader\n`)
  }
  const ld = jsonLdJobs(await page.html(), await page.url())
  if (ld.length) return { raw: ld as unknown as RawJob[], tier: 'json-ld' }
  const raw = await page.evaluate<RawJob[]>(scriptOf(genericExtract as never))
  return { raw, tier: 'generic' }
}

async function collect(page: Page, o: FastOptions, d: FastDeps): Promise<RawJob[]> {
  const site = siteFor(o.domain)
  const single = o.urls.length === 1 && site
  const max = Math.min(MAX_PAGES, o.maxPages ?? MAX_PAGES)
  const targets = single ? Array.from({ length: max }, (_, i) => site.pageUrl(o.urls[0]!, i)) : o.urls.slice(0, max)
  const all = new Map<string, RawJob>()
  for (let i = 0; i < targets.length && !o.cancelled?.(); i++) {
    if (i > 0) await d.sleep(PAUSE_MS[0] + d.random() * (PAUSE_MS[1] - PAUSE_MS[0]))
    await page.navigate(targets[i]!)
    await d.sleep(o.settleSeconds * 1000)
    const here = await page.url()
    const looks = site ? await page.evaluate<boolean>(hasResults(site.resultLinks)) : false
    const wall = await page.evaluate<string | null>(`(${wallReason.toString()})(document, ${JSON.stringify(here)}, ${looks})`)
    if (wall) {
      if (all.size) { o.log(`  stopped at page ${i + 1}: ${wall}\n`); break }
      throw new FastBlocked(wall)
    }
    // Lazily rendered lists: read, scroll, read again until nothing new appears (virtualised lists drop
    // cards that scroll away, so every read is merged).
    let added = 0, idle = 0, tier = ''
    for (let s = 0; s <= MAX_SCROLLS && idle < 2 && !o.cancelled?.(); s++) {
      const read = await readPage(page, site, o.log)
      tier = read.tier
      let grew = 0
      for (const j of read.raw) if (j.url && !all.has(j.url)) { all.set(j.url, j); grew++ }
      added += grew
      idle = grew ? 0 : idle + 1
      if (read.tier === 'json-ld') break // the whole list is in the markup
      await page.scroll()
      await d.sleep(500)
    }
    o.log(`  fast browser: page ${i + 1}/${targets.length} → ${added} new job${added === 1 ? '' : 's'} (${tier || 'nothing readable'})\n`)
    if (!added && i > 0) break // past the last page
    if (!added) throw new FastFallback('no job cards could be read from the page')
  }
  return [...all.values()]
}

export async function fastExtract(o: FastOptions, d: FastDeps = realDeps): Promise<WebJob[]> {
  const bin = d.findBrowser()
  if (!bin) throw new FastFallback('no Chrome or Edge found')
  let browser: Launched | null = null
  let page: Page | null = null
  let timer: NodeJS.Timeout | undefined
  try {
    browser = await d.launch(bin, o.headless)
    page = await d.open(browser.wsUrl, o.domain, o.cookies)
    const timeout = new Promise<never>((_, rej) => { timer = setTimeout(() => rej(new FastFallback('timed out')), OVERALL_TIMEOUT_MS) })
    const raw = await Promise.race([collect(page, o, d), timeout])
    const jobs = validateJobs(raw, o.urls[0]!)
    if (!jobs.length) throw new FastFallback('the cards read did not pass validation')
    return jobs
  } catch (err) {
    if (err instanceof FastBlocked || err instanceof FastFallback) throw err
    throw new FastFallback((err as Error).message)
  } finally {
    clearTimeout(timer)
    page?.close()
    browser?.close()
  }
}
