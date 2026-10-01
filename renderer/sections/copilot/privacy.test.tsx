// @vitest-environment jsdom
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ copilotGetConfig: vi.fn(), copilotSetConfig: vi.fn(), copilotListSessions: vi.fn() }))
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: bridge }))

import { PrivacyPage } from './Privacy'

afterEach(cleanup)

describe('PrivacyPage', () => {
  it('shows 3 months as the default retention, the locked consent row and Privacy mode off', async () => {
    bridge.copilotListSessions.mockResolvedValue([])
    bridge.copilotGetConfig.mockResolvedValue({
      overlay: { clickThroughIdle: true }, hotkeys: { quickHide: 'Control+Alt+Shift+H' },
      privacy: { retentionDays: 90, localOnly: false, redact: true, mode: { enabled: false, noticeVersion: null, hideFromCapture: false, noDockIcon: false, neutralTitle: false, indicator: 'chip' } },
    })
    render(<PrivacyPage />)
    await waitFor(() => expect(screen.getByText(/kept for 3 months, then deleted/)).toBeTruthy())
    expect(screen.getByRole('switch', { name: 'Confirm each live session' }).hasAttribute('disabled')).toBe(true)
    expect(screen.getByRole('switch', { name: 'Privacy mode' }).getAttribute('aria-checked')).toBe('false')
    expect(screen.getByRole('switch', { name: 'Local only' }).hasAttribute('disabled')).toBe(true)
  })
})
