// Cross-review round 2: interactions between the parallel QA changes (merge × rate gap, in-flight detection × deferred ask, held keys).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_CONFIG } from './config'
import { createOverlayHost, type HostDeps } from './overlay-host'
import { createSim, reply } from './sim.test-util'

beforeEach(() => vi.useFakeTimers({ now: 1_000_000 }))
afterEach(() => vi.useRealTimers())

const GOOD = reply('Use a write-ahead log and replay it.', ['Append before applying'])

describe('merge × auto-ask rate gap', () => {
  it('merging a fragment that was never asked does not hand back the slot of the earlier answer still streaming', async () => {
    const sim = createSim({ pick: () => ({ text: GOOD, ttftMs: 3000 }), classify: async () => ({ isQuestion: true, type: 'system-design', hint: { kind: 'system-design', complete: false, needsScreenshot: false, deep: true, source: 'heuristic' } }) })
    sim.final('Tell me about a time you had to debug a production outage?') // asked at t=0, answer streams for 3 s
    await sim.advance(1000)
    sim.final('I was wondering how you would shard orders across') // classified incomplete: not asked
    await sim.advance(300)
    sim.final('several postgres nodes without downtime?') // merges into the fragment: must not bypass the 2.5 s gap
    await sim.advance(1000)
    expect(sim.requests[0]!.aborted).toBe(false)
    await sim.advance(8000)
    expect(sim.done().length).toBeGreaterThanOrEqual(1)
  })
})

describe('in-flight detection × deferred ask', () => {
  it('a slow classify for a later line is not dropped because an earlier line got its ask deferred', async () => {
    const delay: Record<string, number> = { 'I was wondering about incident reviews here': 200, 'I was curious about whether you mentor juniors': 800 }
    const sim = createSim({ pick: () => ({ text: GOOD, ttftMs: 200 }), classify: async t => { await new Promise(r => setTimeout(r, delay[t] ?? 0)); return { isQuestion: true, type: 'other' } } })
    sim.final('Tell me about a time you had to debug a production outage?')
    await sim.advance(1000)
    sim.final('I was wondering about incident reviews here') // classified after 200 ms: rate-limited, ask deferred
    await sim.advance(50)
    sim.final('I was curious about whether you mentor juniors') // classify still running when the line above is decided
    await sim.advance(3000)
    expect(sim.ofType('copilotQuestion').map(q => q.p.text)).toContain('I was curious about whether you mentor juniors')
  })
})

describe('held toggle keys', () => {
  it.each(['quickHide', 'toggle', 'expand'] as const)('auto-repeat of %s does not flip it back', action => {
    let t = 1000
    const overlay = { open: vi.fn(), close: vi.fn(), apply: vi.fn(), isVisible: vi.fn(() => true), setLive: vi.fn(), refresh: vi.fn(), onGone: vi.fn(), onLoaded: vi.fn(), send: vi.fn() }
    const hotkeys = { registerAll: vi.fn(() => [] as never[]), unregisterAll: vi.fn(), check: vi.fn(() => ({ ok: true })) }
    const deps: HostDeps = { overlay, hotkeys, tray: { setState: vi.fn(), onStopNow: vi.fn(), destroy: vi.fn() }, publish: vi.fn(), getConfig: () => DEFAULT_CONFIG, writeConfig: () => DEFAULT_CONFIG, restorePrivacy: vi.fn(), app: { on: vi.fn() }, proc: { on: vi.fn() }, now: () => t }
    const host = createOverlayHost(deps)
    host.publishState({ state: 'listening', mode: 'live', sessionId: 's', sources: ['mic'], startedAt: 1 })
    const press = (hotkeys.registerAll.mock.calls.at(-1) as unknown as [unknown, (a: string) => void])[1]
    press(action); t += 30; press(action); t += 30; press(action)
    expect(overlay.apply).toHaveBeenCalledTimes(1)
    t += 1000; press(action)
    expect(overlay.apply).toHaveBeenCalledTimes(2)
  })
})

describe('panic mid-hedge', () => {
  it('aborts both the slow primary and the backup, shows nothing and reports no error', async () => {
    const sim = createSim({ pick: () => ({ hang: true }) })
    sim.final('How would you make a message consumer crash safe?')
    await sim.advance(4500) // hedge launched at 4 s
    expect(sim.requests).toHaveLength(2)
    sim.panic()
    await sim.advance(5000)
    expect(sim.requests.every(r => r.aborted)).toBe(true)
    expect(sim.requests).toHaveLength(2) // no retry after the abort
    expect(sim.ofType('copilotSuggestion')).toEqual([])
    expect(sim.errors()).toEqual([])
  })
})
