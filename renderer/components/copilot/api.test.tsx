// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ copilotGetConfig: vi.fn(), copilotSetConfig: vi.fn() }))
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: api }))

import { DEFAULT_CONFIG_FOR_TESTS } from './testConfig'
import { useCopilotConfig } from './api'

describe('useCopilotConfig.save', () => {
  it('a slow reply to an earlier edit never overwrites a newer edit (typing in a text box)', async () => {
    api.copilotGetConfig.mockResolvedValue(DEFAULT_CONFIG_FOR_TESTS)
    const slow: Array<() => void> = []
    api.copilotSetConfig.mockImplementation((p: { coaching: { persona: string } }) => new Promise(res => slow.push(() => res({ ...DEFAULT_CONFIG_FOR_TESTS, coaching: { ...DEFAULT_CONFIG_FOR_TESTS.coaching, ...p.coaching } }))))
    const { result } = renderHook(() => useCopilotConfig())
    await waitFor(() => expect(result.current.config).not.toBeNull())
    act(() => { void result.current.save({ coaching: { persona: 'a' } }) })
    act(() => { void result.current.save({ coaching: { persona: 'ab' } }) })
    await act(async () => { slow[0]!() })
    expect(result.current.config?.coaching.persona).toBe('ab')
    await act(async () => { slow[1]!() })
    expect(result.current.config?.coaching.persona).toBe('ab')
  })
  it('a refused edit reverts only when no newer edit is pending', async () => {
    api.copilotGetConfig.mockResolvedValue(DEFAULT_CONFIG_FOR_TESTS)
    api.copilotSetConfig.mockRejectedValueOnce(new Error('nope'))
    const { result } = renderHook(() => useCopilotConfig())
    await waitFor(() => expect(result.current.config).not.toBeNull())
    await act(async () => { await result.current.save({ coaching: { persona: 'x' } }) })
    expect(result.current.config?.coaching.persona).toBe(DEFAULT_CONFIG_FOR_TESTS.coaching.persona)
  })
})
