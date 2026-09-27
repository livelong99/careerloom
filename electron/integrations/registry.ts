// Our own registry for the parts career-ops has no file for: user-added
// skills, and Firecrawl's connection settings. userData/integrations.json.
import fs from 'node:fs'
import path from 'node:path'

import { userFile } from '../context'

export type SkillEntry = { id: string; name: string; description: string | null; repo: string; path: string; installedAt: number; enabled: boolean }
/** `composeDir: ''` (the default) means "use the bundled compose file"; a
 *  non-empty path means "run docker compose from this folder instead". */
export type FirecrawlConfig = { url: string; composeDir: string }
/** Browser boards: where the board's login cookies come from, and per-domain ToS acknowledgements. */
export type BrowserLoginConfig = { source: 'off' | 'chrome' | 'file'; profile: string; cookiesFile: string; headless: boolean; testDomain: string; acks: string[] }
export type IntegrationsRegistry = { skills: SkillEntry[]; firecrawl: FirecrawlConfig; browser: BrowserLoginConfig }

const DEFAULTS: IntegrationsRegistry = {
  skills: [],
  firecrawl: { url: 'http://127.0.0.1:3002', composeDir: '' },
  browser: { source: 'off', profile: 'Default', cookiesFile: '', headless: false, testDomain: 'github.com', acks: [] },
}

export function readRegistry(): IntegrationsRegistry {
  try {
    const raw = JSON.parse(fs.readFileSync(userFile('integrations.json'), 'utf8')) as Partial<IntegrationsRegistry>
    return {
      skills: Array.isArray(raw.skills) ? raw.skills : [],
      firecrawl: { ...DEFAULTS.firecrawl, ...raw.firecrawl },
      browser: { ...DEFAULTS.browser, ...raw.browser },
    }
  } catch {
    return DEFAULTS
  }
}

export function writeRegistry(patch: Partial<IntegrationsRegistry>): IntegrationsRegistry {
  const next = { ...readRegistry(), ...patch }
  const file = userFile('integrations.json')
  fs.mkdirSync(path.dirname(file), { recursive: true })
  fs.writeFileSync(file, JSON.stringify(next, null, 2))
  return next
}

export const userSkillsDir = (): string => userFile('skills')
