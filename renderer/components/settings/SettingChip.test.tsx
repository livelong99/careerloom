// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NAVIGATE_EVENT } from '@/lib/nav'
import { SettingChip } from './SettingChip'

afterEach(cleanup)

describe('SettingChip', () => {
  it('shows a read-only value and deep-links to the Settings page with focus', () => {
    const seen = vi.fn()
    window.addEventListener(NAVIGATE_EVENT, e => seen((e as CustomEvent).detail))
    render(<SettingChip label="Runner" value="Claude Code" page="runners" focus="runner:claude" />)
    expect(screen.getByText('Runner')).toBeTruthy()
    expect(screen.getByText('Claude Code')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Manage Runner in Settings/ }))
    expect(seen).toHaveBeenCalledWith({ section: 'settings', page: 'runners', focus: 'runner:claude' })
  })
})
