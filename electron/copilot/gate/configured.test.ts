import { describe, expect, it } from 'vitest'

import { DEFAULT_CONFIG } from '../config'
import type { CopilotConfig } from '../types'
import { createConfiguredClassify } from './configured'

const AMBIGUOUS = 'in your last job what was the hardest bug to track down'
const answers = { is_question: { type: 'noul', noul: 0.95 }, complete: { type: 'noul', noul: 0.9 }, kind: { type: 'choice', choice: 'behavioral' }, needs_screen: { type: 'noul', noul: 0.01 }, tier: { type: 'choice', choice: 'quick' } }
const cfgWith = (patch: (c: CopilotConfig) => void): CopilotConfig => { const c = structuredClone(DEFAULT_CONFIG); patch(c); return c }
const fakeFetch = () => { const urls: string[] = []; const f = (async (url: string) => { urls.push(url); return new Response(JSON.stringify({ answers }), { status: 200 }) }) as unknown as typeof fetch; return { f, urls } }

describe('configured gate classify', () => {
  it('is off by default: no network, null so the detector uses its own classifier', async () => {
    const { f, urls } = fakeFetch()
    const c = createConfiguredClassify({ config: () => DEFAULT_CONFIG, getKey: () => 'k', fetch: f })
    expect(c).not.toBeNull()
    expect(await c(AMBIGUOUS)).toBeNull()
    expect(urls).toHaveLength(0)
  })
  it('jev on: asks the configured endpoint for an ambiguous line and returns kind and hint', async () => {
    const { f, urls } = fakeFetch()
    const cfg = cfgWith(c => { c.engine.gate = { engine: 'jev', baseUrl: 'https://example.test/api', endpoint: 'systemone' } })
    const r = await createConfiguredClassify({ config: () => cfg, getKey: () => 'k', fetch: f })!(AMBIGUOUS)
    expect(urls).toEqual(['https://example.test/api/v1/systemone'])
    expect(r).toMatchObject({ isQuestion: true, type: 'behavioural', hint: { kind: 'behavioural', complete: true, source: 'jev' } })
  })
  it('follows config changes mid-session and never calls out when privacy.localOnly is set', async () => {
    const { f, urls } = fakeFetch()
    let cfg = cfgWith(c => { c.engine.gate.engine = 'jev' })
    const c = createConfiguredClassify({ config: () => cfg, getKey: () => 'k', fetch: f })!
    await c(AMBIGUOUS)
    expect(urls).toHaveLength(1)
    cfg = cfgWith(c2 => { c2.engine.gate.engine = 'jev'; c2.privacy.localOnly = true })
    expect(await c(AMBIGUOUS)).toBeNull()
    expect(urls).toHaveLength(1)
  })
})
