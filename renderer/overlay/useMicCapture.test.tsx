// @vitest-environment jsdom
import { act, renderHook, waitFor } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { MicHandle } from './capture/mic'
import { useMicCapture } from './useMicCapture'

function fakeMic() {
  const stop = vi.fn()
  let onFrame: (b: ArrayBuffer) => void = () => undefined
  let onEnded: () => void = () => undefined
  const start = vi.fn(async (o: { deviceId?: string | null; onFrame: (b: ArrayBuffer) => void; onEnded?: () => void }): Promise<MicHandle> => { onFrame = o.onFrame; onEnded = o.onEnded ?? onEnded; return { stop } })
  return { start, stop, frame: (b: ArrayBuffer) => onFrame(b), end: () => onEnded() }
}

describe('useMicCapture', () => {
  it('captures while a session is armed or listening and sends frames as mic chunks', async () => {
    const m = fakeMic(), send = vi.fn()
    const { rerender } = renderHook((p: { active: boolean }) => useMicCapture({ active: p.active, sessionId: 'S1', deviceId: 'dev', send, start: m.start }), { initialProps: { active: false } })
    expect(m.start).not.toHaveBeenCalled()
    rerender({ active: true })
    await waitFor(() => expect(m.start).toHaveBeenCalledTimes(1))
    expect(m.start.mock.calls[0]![0].deviceId).toBe('dev')
    m.frame(new Int16Array(1600).buffer)
    expect(send).toHaveBeenCalledWith(expect.objectContaining({ source: 'mic', pcm16: expect.any(ArrayBuffer) }))
    rerender({ active: false })
    expect(m.stop).toHaveBeenCalledTimes(1)
  })

  it('stops the mic even when the session ends before getUserMedia resolved', async () => {
    const stop = vi.fn()
    let release: (h: MicHandle) => void = () => undefined
    const start = vi.fn(() => new Promise<MicHandle>(r => { release = r }))
    const { unmount } = renderHook(() => useMicCapture({ active: true, sessionId: 'S1', deviceId: null, send: vi.fn(), start }))
    unmount()
    release({ stop })
    await waitFor(() => expect(stop).toHaveBeenCalledTimes(1))
  })

  it('a failing mic start is reported, not thrown', async () => {
    const onError = vi.fn()
    renderHook(() => useMicCapture({ active: true, sessionId: 'S1', deviceId: null, send: vi.fn(), start: async () => { throw new Error('denied') }, onError }))
    await waitFor(() => expect(onError).toHaveBeenCalledWith('denied'))
  })

  it('reopens the mic when the device disappears mid-session (unplugged headset), and stops after repeated failures', async () => {
    vi.useFakeTimers()
    const m = fakeMic(), onError = vi.fn()
    renderHook(() => useMicCapture({ active: true, sessionId: 'S1', deviceId: 'usb', send: vi.fn(), start: m.start, onError }))
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    expect(m.start).toHaveBeenCalledTimes(1)
    act(() => m.end())
    await act(async () => { await vi.advanceTimersByTimeAsync(1100) })
    expect(m.start).toHaveBeenCalledTimes(2)
    expect(m.stop).toHaveBeenCalledTimes(1) // the dead handle is released
    m.start.mockRejectedValue(new Error('No microphone found'))
    act(() => m.end())
    await act(async () => { await vi.advanceTimersByTimeAsync(30_000) })
    expect(onError).toHaveBeenCalledWith('No microphone found')
    expect(m.start.mock.calls.length).toBeLessThanOrEqual(2 + 5)
    vi.useRealTimers()
  })

  it('does not reopen after the session ended', async () => {
    vi.useFakeTimers()
    const m = fakeMic()
    const { rerender } = renderHook((p: { active: boolean }) => useMicCapture({ active: p.active, sessionId: 'S1', deviceId: null, send: vi.fn(), start: m.start }), { initialProps: { active: true } })
    await act(async () => { await vi.advanceTimersByTimeAsync(0) })
    act(() => m.end())
    rerender({ active: false })
    await act(async () => { await vi.advanceTimersByTimeAsync(5000) })
    expect(m.start).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
  })
})
