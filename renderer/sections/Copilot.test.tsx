// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

const mac = vi.hoisted(() => ({ value: true }))
vi.mock('../lib/platform', async orig => ({ ...(await orig<typeof import('../lib/platform')>()), isMacPlatform: () => mac.value }))

import { Copilot } from './Copilot'

describe('Copilot shell', () => {
  it('lists all 10 pages on macOS', () => {
    mac.value = true
    render(<Copilot />)
    expect(screen.getAllByRole('tab').map(t => t.textContent)).toEqual(
      ['Setup', 'Practice', 'Audio', 'Transcription', 'Answer engine', 'Coaching', 'Appearance', 'Hotkeys', 'Privacy', 'Sessions'],
    )
  })
  it('says it is macOS-only elsewhere', () => {
    mac.value = false
    render(<Copilot />)
    expect(screen.queryAllByRole('tab')).toHaveLength(0)
    expect(screen.getByText(/macOS only/)).toBeTruthy()
  })
})
