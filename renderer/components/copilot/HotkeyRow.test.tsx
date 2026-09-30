// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => {
  const m = { copilotCheckHotkey: vi.fn() }
  return m
})
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: api }))

import { formatAccelerator, HotkeyRow, toAccelerator } from './HotkeyRow'

afterEach(() => { cleanup(); api.copilotCheckHotkey.mockReset() })
const ev = (o: Partial<Record<'key' | 'code' | 'ctrlKey' | 'altKey' | 'shiftKey' | 'metaKey', unknown>>) => ({ key: 'a', code: 'KeyA', ctrlKey: false, altKey: false, shiftKey: false, metaKey: false, ...o }) as never

describe('toAccelerator / formatAccelerator', () => {
  it('builds Electron accelerators in a fixed modifier order, using the physical key (Alt changes key on mac)', () => {
    expect(toAccelerator(ev({ ctrlKey: true, altKey: true, key: 'å', code: 'KeyA' }))).toBe('Control+Alt+A')
    expect(toAccelerator(ev({ ctrlKey: true, altKey: true, shiftKey: true, code: 'KeyX', key: 'X' }))).toBe('Control+Alt+Shift+X')
    expect(toAccelerator(ev({ metaKey: true, code: 'Digit1', key: '1' }))).toBe('Command+1')
    expect(toAccelerator(ev({ ctrlKey: true, key: 'ArrowUp', code: 'ArrowUp' }))).toBe('Control+Up')
    expect(toAccelerator(ev({ ctrlKey: true, key: ' ', code: 'Space' }))).toBe('Control+Space')
  })
  it('rejects no modifier, shift-only and bare modifier presses', () => {
    expect(toAccelerator(ev({}))).toBeNull()
    expect(toAccelerator(ev({ shiftKey: true }))).toBeNull()
    expect(toAccelerator(ev({ ctrlKey: true, key: 'Control', code: 'ControlLeft' }))).toBeNull()
  })
  it('formats with mac glyphs', () => {
    expect(formatAccelerator('Control+Alt+A')).toBe('⌃⌥A')
    expect(formatAccelerator('Control+Alt+Shift+X')).toBe('⌃⌥⇧X')
    expect(formatAccelerator('Command+Up')).toBe('⌘Up')
  })
})

describe('HotkeyRow', () => {
  it('shows the shortcut and Ready when the check passes', async () => {
    api.copilotCheckHotkey.mockResolvedValue({ ok: true })
    render(<HotkeyRow label="Follow-up" accel="Control+Alt+F" defaultAccel="Control+Alt+F" onChange={vi.fn()} />)
    expect(screen.getByText('⌃⌥F')).toBeTruthy()
    await waitFor(() => expect(screen.getByText('Ready')).toBeTruthy())
  })
  it('says "Not checked" when the checker is not wired', async () => {
    api.copilotCheckHotkey.mockResolvedValue({ status: 'not-implemented', method: 'copilotCheckHotkey' })
    render(<HotkeyRow label="Follow-up" accel="Control+Alt+F" defaultAccel="Control+Alt+F" onChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('Not checked')).toBeTruthy())
  })
  it('flags a conflict in words and offers Choose another', async () => {
    api.copilotCheckHotkey.mockResolvedValue({ ok: false, reason: 'in-use' })
    render(<HotkeyRow label="Screenshot" accel="Control+Alt+S" defaultAccel="Control+Alt+S" onChange={vi.fn()} />)
    await waitFor(() => expect(screen.getByText('In use by another app')).toBeTruthy())
    expect(screen.getByRole('button', { name: /Choose another/ })).toBeTruthy()
  })
  it('records a new shortcut, cancels on Esc, ignores a press without a modifier', async () => {
    api.copilotCheckHotkey.mockResolvedValue({ ok: true })
    const onChange = vi.fn()
    render(<HotkeyRow label="Clarify" accel="Control+Alt+C" defaultAccel="Control+Alt+C" onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: 'Change Clarify' }))
    const rec = screen.getByRole('button', { name: /Press the new shortcut/ })
    fireEvent.keyDown(rec, { key: 'q', code: 'KeyQ' })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.keyDown(rec, { key: 'Escape', code: 'Escape' })
    expect(screen.getByRole('button', { name: 'Change Clarify' })).toBeTruthy()
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: 'Change Clarify' }))
    fireEvent.keyDown(screen.getByRole('button', { name: /Press the new shortcut/ }), { key: 'q', code: 'KeyQ', ctrlKey: true, altKey: true })
    expect(onChange).toHaveBeenCalledWith('Control+Alt+Q')
  })
  it('a fixed row has no Change button; Reset appears only when not default', () => {
    api.copilotCheckHotkey.mockResolvedValue({ ok: true })
    const { rerender } = render(<HotkeyRow label="Stop everything now" accel="Control+Alt+Shift+X" defaultAccel="Control+Alt+Shift+X" fixed onChange={vi.fn()} />)
    expect(screen.queryByRole('button', { name: /Change/ })).toBeNull()
    expect(screen.getByText('Always on')).toBeTruthy()
    rerender(<HotkeyRow label="Clarify" accel="Control+Alt+Q" defaultAccel="Control+Alt+C" onChange={vi.fn()} />)
    expect(screen.getByRole('button', { name: 'Reset Clarify' })).toBeTruthy()
  })
})
