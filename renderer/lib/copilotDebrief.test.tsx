// @vitest-environment jsdom
import { renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { GOTO_EVENT } from '../components/copilot/selection'
import { NAVIGATE_EVENT } from './nav'
import { useDebriefLink } from './copilotDebrief'

afterEach(() => { delete (window as { careerloom?: unknown }).careerloom })

describe('useDebriefLink', () => {
  it('opens Copilot → Sessions when main says the overlay asked for the debrief', () => {
    let fire: (p: unknown) => void = () => undefined
    const off = vi.fn()
    ;(window as { careerloom?: unknown }).careerloom = { onCopilotEvent: (name: string, cb: (p: unknown) => void) => { expect(name).toBe('copilotOpenDebrief'); fire = cb; return off } }
    const nav = vi.fn(), go = vi.fn()
    window.addEventListener(NAVIGATE_EVENT, nav); window.addEventListener(GOTO_EVENT, go)
    const { unmount } = renderHook(() => useDebriefLink())
    fire({ sessionId: 's1' })
    expect((nav.mock.calls[0]![0] as CustomEvent).detail).toBe('copilot')
    return new Promise<void>(resolve => setTimeout(() => {
      expect((go.mock.calls[0]![0] as CustomEvent).detail).toBe('sessions')
      unmount(); expect(off).toHaveBeenCalled(); resolve()
    }, 20))
  })

  it('does nothing when the bridge has no copilot events (non-macOS, tests)', () => {
    expect(() => renderHook(() => useDebriefLink())).not.toThrow()
  })
})
