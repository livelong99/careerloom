// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mac = vi.hoisted(() => ({ value: true }))
vi.mock('../lib/platform', async orig => ({ ...(await orig<typeof import('../lib/platform')>()), isMacPlatform: () => mac.value, copilotSupportedHere: () => mac.value }))

// Pages load from the bridge on mount: every call stays pending, every `on*` subscription is a no-op.
vi.mock('@/lib/ipc', async orig => ({
  ...(await orig<typeof import('@/lib/ipc')>()),
  careerloom: new Proxy({}, { get: (_t, k) => (String(k).startsWith('on') ? () => () => {} : () => new Promise(() => {})) }),
}))

import { Copilot } from './Copilot'

describe('Copilot shell', () => {
  it('lists the 7 live-tuning pages on macOS (speech, engine and privacy moved to Settings)', () => {
    mac.value = true
    render(<Copilot />)
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(
      ['Setup', 'Practice', 'Audio', 'Coaching', 'Appearance', 'Hotkeys', 'Sessions'],
    )
  })
  it('says it is macOS and Windows only elsewhere', () => {
    mac.value = false
    render(<Copilot />)
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.getByText(/macOS and Windows only/)).toBeTruthy()
  })
})
