// Test helpers for Settings pages: a fake bridge, a settings fixture and a RunsContext wrapper.
import type { ReactNode } from 'react'
import { vi } from 'vitest'

import { RunsContext, type Runs } from '../../hooks/useRuns'
import type { Settings } from '../../lib/types'

export const settingsFixture = (over: Partial<Settings> = {}): Settings => ({
  root: '/home/me/career-ops', runner: 'claude', models: {}, helperModels: {}, hasApiKey: false, hasOpencodeKey: false,
  rootCheck: { ok: true, root: '/home/me/career-ops', dataRoot: '/home/me/career-ops/data' },
  prefs: { updates: { enabled: true }, retention: { runLogDays: null }, docs: { tone: 'concise', length: 'standard', humanize: true } },
  keyMeta: {},
  ...over,
})

/** Every bridge call is a vi.fn that resolves undefined until a test says otherwise; `on*` subscriptions are no-ops. */
export function fakeBridge(impl: Record<string, unknown> = {}) {
  const calls = new Map<string, ReturnType<typeof vi.fn>>()
  return new Proxy({} as Record<string, ReturnType<typeof vi.fn>>, {
    get: (_t, k: string) => {
      if (!calls.has(k)) calls.set(k, vi.fn(k.startsWith('on') ? () => () => {} : typeof impl[k] === 'function' ? (impl[k] as () => unknown) : () => Promise.resolve(impl[k])))
      return calls.get(k)
    },
  })
}

const runs: Runs = { runs: [], logs: {}, generation: 0, start: async () => null, evaluate: async () => null, adopt: () => {}, cancel: () => {} }
export const WithRuns = ({ children, value = runs }: { children: ReactNode; value?: Runs }) => <RunsContext.Provider value={value}>{children}</RunsContext.Provider>
