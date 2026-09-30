// Dev-only QA switch (never in a packaged app): `CL_COPILOT_E2E=<json file>` points the copilot at a fake OpenRouter server
// and a fake STT fixture, so the whole flow can be exercised on a cloned profile with no key, no model and no spend.
import fs from 'node:fs'

import { app } from 'electron'

export type E2eHooks = { baseUrl: string; sttFixture: string }

export function e2eHooks(): E2eHooks | null {
  const file = process.env.CL_COPILOT_E2E
  if (!file || app.isPackaged) return null
  const h = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<E2eHooks>
  if (typeof h.baseUrl !== 'string' || typeof h.sttFixture !== 'string') throw new Error('CL_COPILOT_E2E needs baseUrl and sttFixture')
  return { baseUrl: h.baseUrl, sttFixture: h.sttFixture }
}
