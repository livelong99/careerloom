// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { NAVIGATE_EVENT } from '@/lib/nav'
import { DEFAULT_CONFIG_FOR_TESTS } from './testConfig'
import { ConfigStrip, summarizeConfig } from './ConfigStrip'

afterEach(cleanup)

describe('summarizeConfig', () => {
  it('names engine+model, tier and retention in plain words', () => {
    const s = summarizeConfig({ ...DEFAULT_CONFIG_FOR_TESTS, privacy: { ...DEFAULT_CONFIG_FOR_TESTS.privacy, retentionDays: 90 } })
    expect(s.speech).toMatch(/Moonshine|Whisper/)
    expect(s.answers).toMatch(/Fast|Balanced|Deep/)
    expect(s.privacy).toContain('3 months')
  })
  it('reports Privacy mode on', () => {
    const c = DEFAULT_CONFIG_FOR_TESTS
    expect(summarizeConfig({ ...c, privacy: { ...c.privacy, mode: { ...c.privacy.mode, enabled: true } } }).privacy).toContain('Privacy mode on')
  })
})

describe('ConfigStrip', () => {
  it('shows three read-only chips that deep-link to Settings › Copilot', () => {
    const seen = vi.fn()
    window.addEventListener(NAVIGATE_EVENT, e => seen((e as CustomEvent).detail))
    render(<ConfigStrip config={DEFAULT_CONFIG_FOR_TESTS} />)
    fireEvent.click(screen.getByRole('button', { name: 'Manage Speech to text in Settings' }))
    expect(seen).toHaveBeenCalledWith({ section: 'settings', page: 'copilot', focus: 'copilot:stt' })
    expect(screen.getAllByRole('button', { name: /in Settings/ })).toHaveLength(3)
  })
})
