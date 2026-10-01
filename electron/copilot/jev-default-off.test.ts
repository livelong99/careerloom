import { describe, expect, it, vi } from 'vitest'

import { DEFAULT_CONFIG, normalizeConfig } from './config'
import { createConfiguredClassify } from './gate/configured'

describe('Jev stays off unless explicitly chosen', () => {
  it('the default gate is the local heuristic, screenshots are opt-in', () => {
    expect(DEFAULT_CONFIG.engine.gate.engine).toBe('heuristic')
    expect(DEFAULT_CONFIG.engine.screenshots).toBe(false)
    expect(normalizeConfig({}).engine.gate.engine).toBe('heuristic')
    expect(normalizeConfig({}).engine.screenshots).toBe(false)
  })
  it('turning screenshots on does not turn Jev on', () => {
    const c = normalizeConfig({ engine: { screenshots: true, vision: 'vision' } })
    expect(c.engine.screenshots).toBe(true)
    expect(c.engine.gate.engine).toBe('heuristic')
  })
  it('the default config never makes a Jev request, with or without screenshots, and ignores a stray key', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}'))
    for (const patch of [{}, { screenshots: true }]) {
      const cfg = normalizeConfig({ engine: patch })
      const classify = createConfiguredClassify({ config: () => cfg, getKey: () => 'sk-test-not-real', fetch: fetchSpy as never })
      expect(await classify('Could you walk me through that again?')).toBeNull()
    }
    expect(fetchSpy).not.toHaveBeenCalled()
  })
  it('Jev only runs when gate.engine is "jev" AND local-only is off (local-only blocks it)', async () => {
    const fetchSpy = vi.fn(async () => new Response('{}', { status: 500 }))
    const cfg = normalizeConfig({ engine: { gate: { engine: 'jev' } }, privacy: { localOnly: true } })
    await createConfiguredClassify({ config: () => cfg, getKey: () => 'k', fetch: fetchSpy as never })('Walk me through it?')
    expect(fetchSpy).not.toHaveBeenCalled() // localOnly blocks it
  })
})
