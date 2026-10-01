import { describe, expect, it, vi } from 'vitest'

vi.mock('../context', () => ({ broadcast: vi.fn(), launchTask: vi.fn(), readSettings: vi.fn(), runs: new Map(), userFile: (n: string) => `/nonexistent/${n}` }))
vi.mock('../onboarding', () => ({ defaultDir: () => '/x', dirState: () => 'missing', nodeVersionOk: () => true, onboardingHandlers: {}, probe: vi.fn() }))

import { bootstrapHandlers, bootstrapStatus, runBootstrap, summarize } from './bootstrap'

const step = (id: string, core: boolean, state: string) => ({ id, label: id, core, state, detail: null, sizeMb: null, runId: null, error: null }) as never

describe('bootstrap status', () => {
  it('coreDone ignores non-core; skipped counts as settled', () => {
    const s = summarize([step('node', true, 'done'), step('career-ops', true, 'skipped'), step('stt', false, 'failed')], false)
    expect(s.coreDone).toBe(true)
    expect(s.allDone).toBe(false)
  })
  it('a failed core step blocks coreDone', () => {
    expect(summarize([step('node', true, 'failed')], false).coreDone).toBe(false)
  })
  it('starts as 7 pending steps, core first', () => {
    const s = bootstrapStatus()
    expect(s.steps.map(x => x.id)).toEqual(['node', 'python', 'git', 'career-ops', 'opencode', 'prescreen-model', 'stt'])
    expect(s.steps.filter(x => x.core)).toHaveLength(5)
    expect(s.coreDone).toBe(false)
  })
  it('rejects an unknown retry step', () => {
    expect(() => bootstrapHandlers.bootstrapStart!({ retry: 'nope' })).toThrow(/Unknown/)
  })
  it('CAREERLOOM_NO_BOOTSTRAP makes a pass a no-op', async () => {
    process.env.CAREERLOOM_NO_BOOTSTRAP = '1'
    await runBootstrap()
    delete process.env.CAREERLOOM_NO_BOOTSTRAP
    expect(bootstrapStatus().running).toBe(false)
    expect(bootstrapStatus().steps.every(x => x.state === 'pending')).toBe(true)
  })
})
