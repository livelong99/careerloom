// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { PRIVACY_NOTICE_VERSION } from '../../../electron/copilot/privacy-mode'
import { PrivacyModeNotice } from './PrivacyModeNotice'

describe('PrivacyModeNotice', () => {
  it('states the three plain facts before anything is turned on', () => {
    render(<PrivacyModeNotice open onAccept={() => undefined} onCancel={() => undefined} />)
    expect(screen.getByText(/Before you turn on Privacy mode/i)).toBeTruthy()
    expect(screen.getByText(/don't allow AI assistance/i)).toBeTruthy()
    expect(screen.getByText(/unreliable on macOS 15 and later/i)).toBeTruthy()
    expect(screen.getByText(/menu bar icon/i)).toBeTruthy()
  })

  it('accepting reports the notice version that was shown', () => {
    const onAccept = vi.fn()
    render(<PrivacyModeNotice open onAccept={onAccept} onCancel={() => undefined} />)
    fireEvent.click(screen.getByRole('button', { name: /I understand, turn on/i }))
    expect(onAccept).toHaveBeenCalledWith(PRIVACY_NOTICE_VERSION)
  })

  it('cancel leaves everything off', () => {
    const onAccept = vi.fn(), onCancel = vi.fn()
    render(<PrivacyModeNotice open onAccept={onAccept} onCancel={onCancel} />)
    fireEvent.click(screen.getByRole('button', { name: /Cancel/i }))
    expect(onCancel).toHaveBeenCalled()
    expect(onAccept).not.toHaveBeenCalled()
  })

  it('Escape cancels', () => {
    const onCancel = vi.fn()
    render(<PrivacyModeNotice open onAccept={() => undefined} onCancel={onCancel} />)
    fireEvent.keyDown(document.activeElement ?? document.body, { key: 'Escape' })
    expect(onCancel).toHaveBeenCalled()
  })

  it('renders nothing when closed', () => {
    render(<PrivacyModeNotice open={false} onAccept={() => undefined} onCancel={() => undefined} />)
    expect(screen.queryByText(/Before you turn on/i)).toBeNull()
  })
})
