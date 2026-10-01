// Real-world wiring for research (electron main only): config, keychain keys, job facts, helper-tier model, store, network.
import { createHash } from 'node:crypto'
import { app } from 'electron'

import { launchTask, readSecret, runs, userFile, broadcast } from '../../context'
import { browserPageText } from '../../integrations/browser-fetch'
import { assertPublicResolution, firecrawlReady, firecrawlScrape } from '../../integrations/firecrawl'
import { jobContext } from '../../job-view/handlers'
import { runText } from '../../job-view/agent'
import { readCv } from '../../resume-agent'
import { defaultPrices, estimateUsd } from '../../copilot/cost'
import { secretName } from '../../settings/keys'
import { readInterviewConfig } from '../config'
import { openKbStore } from '../store'
import { realHttp } from './fetch'
import { createResearchService } from './service'
import { openResearchState } from './state'

/** The job id is a URL, so folders are named by its hash. WP1's store must use the same name (`kbJobDir`). */
export const kbJobDir = (jobId: string): string => createHash('sha1').update(jobId).digest('hex').slice(0, 24)
const kbRoot = (): string => userFile('kb')
/** Used when the model has no price-table entry: deliberately above nano-class rates so the cap errs on the safe side. */
const FALLBACK_USD_PER_1K_TOKENS = 0.0006

/** One Chrome at a time (16 GB Mac): thin pages queue for the browser while plain fetches run 6 wide. */
let browser: Promise<unknown> = Promise.resolve()
const oneBrowser = (url: string): Promise<string> => {
  const run = browser.then(() => browserPageText(url), () => browserPageText(url))
  browser = run.catch(() => undefined)
  return run
}

let service: ReturnType<typeof createResearchService> | null = null
export function researchService() {
  return (service ??= createResearchService({
    config: readInterviewConfig,
    secret: id => readSecret(secretName(id)),
    job: jobId => {
      const c = jobContext(jobId)
      return { title: c.job.title, company: c.job.company, posting: c.posting, gaps: c.keywords.filter(k => k.status === 'missing').map(k => k.keyword), cv: readCv()?.markdown ?? '' }
    },
    llm: (prompt, jobId) => runText(prompt, { tier: 'helper', label: 'Job research', jobId }),
    store: () => openKbStore(kbRoot),
    state: openResearchState(kbRoot, kbJobDir),
    net: {
      http: realHttp(`Careerloom/${app.getVersion()}`), resolve: assertPublicResolution,
      cdp: oneBrowser,
      firecrawl: async url => ((await firecrawlReady()) ? (await firecrawlScrape(url)).markdown : ''),
      now: Date.now, sleep: (ms, signal) => new Promise<void>((resolve, reject) => {
        const t = setTimeout(resolve, ms)
        signal.addEventListener('abort', () => { clearTimeout(t); reject(signal.reason) }, { once: true })
      }),
      userAgent: `Careerloom/${app.getVersion()}`,
    },
    launch: launchTask,
    getRun: id => runs.get(id),
    emit: (event, payload) => broadcast(`careerloom:${event}`, payload),
    priceCall: (model, tokens) => {
      if (tokens === null) return 0.002
      const priced = model ? estimateUsd(defaultPrices, model, Math.round(tokens * 0.85), Math.round(tokens * 0.15)) : null
      return priced ?? (tokens / 1000) * FALLBACK_USD_PER_1K_TOKENS
    },
  }))
}
