// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('../../lib/ipc', async orig => ({
  ...(await orig<typeof import('../../lib/ipc')>()),
  careerloom: new Proxy({}, { get: (_t, k: string) => bridge.current[k] }),
}))

import { fakeBridge, settingsFixture, WithRuns } from './testKit'
import { PAGE_GROUPS } from './pages'
import { SettingsShell } from './SettingsShell'

beforeEach(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
  bridge.current = fakeBridge({ runnerStatus: { git: '2.45', node: '22', claude: null, codex: null, antigravity: null, opencode: null }, getReadiness: null })
  Element.prototype.scrollIntoView = vi.fn()
})

const shell = (props: Partial<React.ComponentProps<typeof SettingsShell>> = {}) =>
  render(<WithRuns><SettingsShell settings={settingsFixture()} onChanged={() => {}} {...props} /></WithRuns>)

describe('SettingsShell', () => {
  it('lists 14 pages in 5 groups and starts on General', () => {
    shell()
    expect(within(screen.getByRole('tablist', { name: 'Settings pages' })).getAllByRole('tab')).toHaveLength(14)
    expect(PAGE_GROUPS.map(g => g.label)).toEqual(['Basics', 'AI', 'Connections', 'Workflows', 'System'])
    expect(screen.getByRole('tab', { name: 'General' })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('heading', { name: 'General', level: 2 })).toBeInTheDocument()
  })

  it('has an Interview prep page right after Copilot (stub until WP6)', async () => {
    shell()
    const tabs = within(screen.getByRole('tablist', { name: 'Settings pages' })).getAllByRole('tab').map(t => t.textContent)
    expect(tabs.indexOf('Interview prep')).toBe(tabs.indexOf('Copilot') + 1)
    await userEvent.click(screen.getByRole('tab', { name: 'Interview prep' }))
    expect(screen.getByRole('heading', { name: 'Interview prep', level: 2 })).toBeInTheDocument()
  })

  it('remembers the last page', async () => {
    const { unmount } = shell()
    await userEvent.click(screen.getByRole('tab', { name: 'Advanced' }))
    expect(localStorage.getItem('careerloom.settingsPage')).toBe('advanced')
    unmount()
    shell()
    expect(screen.getByRole('tab', { name: 'Advanced' })).toHaveAttribute('aria-selected', 'true')
  })

  it('opens the deep-linked page and pulses the focused control', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
    shell({ target: { page: 'general', focus: 'theme', nonce: 1 } })
    const row = document.querySelector('[data-setting-id="theme"]')!
    await waitFor(() => expect(row.classList.contains('ring-2')).toBe(true))
    expect(Element.prototype.scrollIntoView).toHaveBeenCalled()
    act(() => { vi.advanceTimersByTime(1300) })
    expect(row.classList.contains('ring-2')).toBe(false)
    vi.useRealTimers()
  })

  it('re-pulses when the same link is followed again (new nonce)', async () => {
    const { rerender } = shell({ target: { page: 'general', focus: 'theme', nonce: 1 } })
    const row = document.querySelector('[data-setting-id="theme"]')!
    await waitFor(() => expect(row.classList.contains('ring-2')).toBe(true))
    rerender(<WithRuns><SettingsShell settings={settingsFixture()} onChanged={() => {}} target={{ page: 'general', focus: 'theme', nonce: 2 }} /></WithRuns>)
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledTimes(2)
  })

  it('shows an attention dot with its reason on the nav', () => {
    shell({ attention: { keys: 'The API key runner needs an OpenRouter key' } })
    expect(screen.getByRole('tab', { name: /API keys/ })).toContainElement(screen.getByRole('img', { name: /OpenRouter key/ }))
  })

  it('search jumps to the page and focus', async () => {
    shell()
    await userEvent.type(screen.getByRole('combobox', { name: 'Search settings' }), 'retention')
    await userEvent.click(await screen.findByText('Run-log retention'))
    expect(screen.getByRole('tab', { name: 'Data & privacy' })).toHaveAttribute('aria-selected', 'true')
    await waitFor(() => expect(document.querySelector('[data-setting-id="retention"]')!.classList.contains('ring-2')).toBe(true))
  })

  it('"/" focuses the search box', () => {
    shell()
    fireEvent.keyDown(window, { key: '/' })
    expect(screen.getByRole('combobox', { name: 'Search settings' })).toHaveFocus()
  })

  it('has a real page behind every tab (no stubs left)', async () => {
    shell()
    await userEvent.click(screen.getByRole('tab', { name: 'Jobs & boards' }))
    expect(screen.queryByText(/arrives with/)).toBeNull()
  })
})
