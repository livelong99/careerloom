// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ copilotAckPrivacyNotice: vi.fn() }))
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: bridge }))

import { accelLabel, DEFAULT_MODE, PrivacyModeGroup } from './PrivacyModeGroup'

afterEach(() => { cleanup(); bridge.copilotAckPrivacyNotice.mockReset() })

const on = { ...DEFAULT_MODE, enabled: true, noticeVersion: 'v', hideFromCapture: true, noDockIcon: true, neutralTitle: true, indicator: 'dot' as const }
const view = (mode = DEFAULT_MODE) => {
  const save = vi.fn().mockResolvedValue({})
  render(<PrivacyModeGroup mode={mode} clickThroughIdle quickHide="Control+Alt+Shift+H" save={save} />)
  return save
}

describe('accelLabel', () => {
  it('uses mac symbols', () => expect(accelLabel('Control+Alt+Shift+H')).toBe('⌃⌥⇧H'))
})

describe('PrivacyModeGroup', () => {
  it('is off by default, announces its state, and sub-options are disabled', () => {
    view()
    expect(screen.getByRole('switch', { name: 'Privacy mode' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('switch', { name: 'Hide from screen sharing' }).hasAttribute('disabled')).toBe(true)
  })
  it('opens the notice first and does not enable until accepted', async () => {
    const save = view()
    fireEvent.click(screen.getByRole('switch', { name: 'Privacy mode' }))
    expect(screen.getByText('Before you turn on Privacy mode')).toBeTruthy()
    expect(save).not.toHaveBeenCalled()
    expect(bridge.copilotAckPrivacyNotice).not.toHaveBeenCalled()
    bridge.copilotAckPrivacyNotice.mockResolvedValue({ ok: true })
    fireEvent.click(screen.getByRole('button', { name: /I understand/ }))
    await waitFor(() => expect(save).toHaveBeenCalledWith({ privacy: { mode: { enabled: true } } }))
    expect(bridge.copilotAckPrivacyNotice).toHaveBeenCalled()
  })
  it('cancel leaves it off', () => {
    const save = view()
    fireEvent.click(screen.getByRole('switch', { name: 'Privacy mode' }))
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(save).not.toHaveBeenCalled()
  })
  it('a refused ack does not enable', async () => {
    const save = view()
    bridge.copilotAckPrivacyNotice.mockResolvedValue({ ok: false })
    fireEvent.click(screen.getByRole('switch', { name: 'Privacy mode' }))
    fireEvent.click(screen.getByRole('button', { name: /I understand/ }))
    await waitFor(() => expect(bridge.copilotAckPrivacyNotice).toHaveBeenCalled())
    expect(save).not.toHaveBeenCalled()
  })
  it('turning off restores every sub-option to its default without asking', () => {
    const save = view(on)
    fireEvent.click(screen.getByRole('switch', { name: 'Privacy mode' }))
    expect(save).toHaveBeenCalledWith({ privacy: { mode: { enabled: false, hideFromCapture: false, noDockIcon: false, neutralTitle: false, indicator: 'chip' } } })
  })
  it('sub-options save when on', () => {
    const save = view(on)
    fireEvent.click(screen.getByRole('switch', { name: 'No dock icon' }))
    expect(save).toHaveBeenCalledWith({ privacy: { mode: { noDockIcon: false } } })
  })
})
