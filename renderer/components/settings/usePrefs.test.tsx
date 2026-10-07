// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ prefsGet: vi.fn(), prefsSet: vi.fn() }))
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: api }))

import { usePrefs } from './usePrefs'

const P = { updates: { enabled: true }, retention: { runLogDays: null }, docs: { tone: 'warm', length: 'standard', humanize: true }, debug: { dir: null } }

describe('usePrefs.patch', () => {
  it('a slow reply to an earlier edit never overwrites a newer edit', async () => {
    api.prefsGet.mockResolvedValue(P)
    const slow: Array<() => void> = []
    api.prefsSet.mockImplementation((p: { retention: { runLogDays: number } }) => new Promise(res => slow.push(() => res({ ...P, retention: p.retention }))))
    const { result } = renderHook(() => usePrefs())
    await waitFor(() => expect(result.current.prefs).not.toBeNull())
    act(() => { void result.current.patch({ retention: { runLogDays: 7 } }) })
    act(() => { void result.current.patch({ retention: { runLogDays: 30 } }) })
    await act(async () => { slow[0]!() })
    expect(result.current.prefs?.retention.runLogDays).toBe(30)
  })
})
