// Dev-only QA switch (never in a packaged app): `CL_KB_E2E=1` swaps research's search, network and model for the synthetic fixtures,
// so the whole KB flow runs on a cloned profile with no key, no network and no spend (plan §12).
import { app } from 'electron'

import { createFakeLlm } from './fixtures/llm'
import { ALL_RESULTS, createFakeWeb } from './fixtures/web'
import { createFakeBackend } from './search/fake'
import type { ServiceEnv } from './service'

export function kbE2e(): Pick<ServiceEnv, 'backends' | 'net' | 'llm'> | null {
  if (process.env.CL_KB_E2E !== '1' || app.isPackaged) return null
  const web = createFakeWeb()
  const llm = createFakeLlm({ usd: 0.002 })
  return {
    backends: () => [createFakeBackend({ results: () => ALL_RESULTS, usdPerCall: 0.001 })],
    // a real clock (stored timestamps must be real) and short waits, so a run takes seconds
    net: { ...web.deps, now: Date.now, sleep: ms => new Promise(r => setTimeout(r, Math.min(ms, 30))) },
    llm: async prompt => {
      await new Promise(r => setTimeout(r, 400)) // slow enough for the progress stepper to be seen
      const r = await llm.call(prompt, prompt, new AbortController().signal)
      return { text: r.text, tokens: null, model: 'fake/e2e' }
    },
  }
}
