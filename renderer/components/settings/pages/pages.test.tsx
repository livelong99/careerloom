// @vitest-environment jsdom
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('../../../lib/ipc', async orig => ({
  ...(await orig<typeof import('../../../lib/ipc')>()),
  careerloom: new Proxy({}, { get: (_t, k: string) => bridge.current[k] }),
}))

import { AppPrefsProvider } from '../AppPrefsProvider'
import { REGISTRY } from '../settings-registry'
import { fakeBridge, settingsFixture, WithRuns } from '../testKit'
import { AdvancedPage } from './Advanced'
import { DataPage } from './Data'
import { GeneralPage } from './General'
import { dismissToast, getToast } from '../../../lib/toast'

const ok = { runnerStatus: { git: '2.45', node: '22', claude: null, codex: null, antigravity: null, opencode: null }, getReadiness: { root: '/r', checkedAt: 0, deps: true, clis: [] } }
const props = (over = {}) => ({ settings: settingsFixture(over), onChanged: vi.fn() })
const mount = (ui: React.ReactNode) => render(<WithRuns><AppPrefsProvider>{ui}</AppPrefsProvider></WithRuns>)

beforeEach(() => {
  globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
  Element.prototype.hasPointerCapture ??= () => false
  Element.prototype.releasePointerCapture ??= () => {}
  Element.prototype.scrollIntoView ??= () => {}
  bridge.current = fakeBridge(ok)
  dismissToast()
})

describe('registry points at real controls on the pages this package owns', () => {
  const cases: Array<[string, () => React.ReactNode]> = [['general', () => <GeneralPage {...props()} />], ['data', () => <DataPage {...props()} />], ['advanced', () => <AdvancedPage {...props()} />]]
  it.each(cases)('%s', (page, ui) => {
    const { container } = mount(ui())
    const have = new Set([...container.querySelectorAll('[data-focus]')].map(n => (n as HTMLElement).dataset.focus))
    const missing = REGISTRY.filter(e => e.page === page && e.focus && !have.has(e.focus)).map(e => e.focus)
    expect(missing).toEqual([])
  })
})

describe('General', () => {
  it('theme change applies at once and offers undo', async () => {
    mount(<GeneralPage {...props()} />)
    await userEvent.click(screen.getByRole('tab', { name: 'Dark' }))
    expect(document.documentElement.dataset.theme).toBe('dark')
    await waitFor(() => expect(getToast()?.action?.label).toBe('Undo'))
    getToast()!.action!.onClick()
    expect(document.documentElement.dataset.theme).toBeUndefined()
  })

  it('refresh cadence is persisted to localStorage', async () => {
    mount(<GeneralPage {...props()} />)
    await userEvent.click(screen.getByRole('tab', { name: /^5 min/ }))
    expect(localStorage.getItem('careerloom.refreshInterval')).toBe('5m')
  })

  it('updates toggle writes prefs and calls onChanged', async () => {
    const p = props()
    mount(<GeneralPage {...p} />)
    await userEvent.click(screen.getByRole('switch', { name: 'Check for updates' }))
    await waitFor(() => expect(bridge.current.prefsSet).toHaveBeenCalledWith({ updates: { enabled: false } }))
    await waitFor(() => expect(p.onChanged).toHaveBeenCalled())
  })

  it('says why "Check now" failed instead of crashing when the backend is not ready', async () => {
    bridge.current = fakeBridge({ ...ok, checkForUpdates: () => Promise.reject(new Error('checkForUpdates is not implemented yet')) })
    mount(<GeneralPage {...props()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Check now' }))
    await waitFor(() => expect(getToast()?.text).toMatch(/not implemented yet/))
  })

  it('offers install only while the folder is not valid', () => {
    mount(<GeneralPage {...props({ rootCheck: { ok: false, reason: 'No such folder' } })} />)
    expect(screen.getByText('No such folder')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Install career-ops…' })).toBeInTheDocument()
  })
})

describe('Data & privacy', () => {
  it('shows locations and stats, and tolerates unfinished backend methods', async () => {
    bridge.current = fakeBridge({
      ...ok,
      dataLocations: [{ id: 'appData', label: 'App data', path: '/u/app' }],
      dataStats: { runs: 12, runLogFiles: 3, runLogBytes: 2048, threads: 4, copilotSessions: 1 },
      keysList: () => Promise.reject(new Error('keysList is not implemented yet')),
    })
    mount(<DataPage {...props()} />)
    expect(await screen.findByText('/u/app')).toBeInTheDocument()
    expect((await screen.findAllByText(/12 runs/)).length).toBeGreaterThan(0)
    expect(await screen.findByText(/keysList is not implemented yet/)).toBeInTheDocument()
  })

  it('retention change saves a pref (with undo) and prune is disabled while keeping forever', async () => {
    const p = props()
    mount(<DataPage {...p} />)
    expect(screen.getByRole('button', { name: 'Prune now' })).toBeDisabled()
    await userEvent.click(screen.getByRole('combobox', { name: 'Run-log retention' }))
    await userEvent.click(await screen.findByRole('option', { name: '30 days' }))
    await waitFor(() => expect(bridge.current.prefsSet).toHaveBeenCalledWith({ retention: { runLogDays: 30 } }))
  })

  it('clearing run logs names the consequence and calls dataClear only after confirming', async () => {
    mount(<DataPage {...props()} />)
    await userEvent.click(screen.getByRole('button', { name: /Danger zone/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Clear logs…' }))
    expect(await screen.findByText(/cannot be undone/)).toBeInTheDocument()
    expect(bridge.current.dataClear).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Clear logs' }))
    await waitFor(() => expect(bridge.current.dataClear).toHaveBeenCalledWith('run-logs'))
  })

  it('deleting Copilot sessions uses the existing delete-all', async () => {
    mount(<DataPage {...props()} />)
    await userEvent.click(screen.getByRole('button', { name: /Danger zone/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete sessions…' }))
    await userEvent.click(screen.getByRole('button', { name: 'Delete sessions' }))
    await waitFor(() => expect(bridge.current.copilotDeleteSession).toHaveBeenCalledWith('all'))
  })
})

describe('Advanced', () => {
  it('renders diagnostics rows with text status and copies a report', async () => {
    bridge.current = fakeBridge({ ...ok, diagnostics: { rows: [{ id: 'node', label: 'Node', value: 'v22', status: 'ok' }, { id: 'codex', label: 'codex', value: null, status: 'warn', hint: 'Not signed in' }], memory: { totalBytes: 16 * 1024 ** 3, freeBytes: 9 * 1024 ** 3 } } })
    const writeText = vi.fn(() => Promise.resolve())
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true })
    mount(<AdvancedPage {...props()} />)
    expect(await screen.findByText('v22')).toBeInTheDocument()
    expect(screen.getByText('Not signed in')).toBeInTheDocument()
    expect(screen.getByText(/9\.0 GB free of 16\.0 GB/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Copy report' }))
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('Node: v22 (OK)'))
  })

  it('reset everything needs the typed word, then resets main + local state and reloads', async () => {
    const reload = vi.fn()
    Object.defineProperty(window, 'location', { value: { ...window.location, reload }, configurable: true })
    localStorage.setItem('careerloom.theme', 'dark')
    localStorage.setItem('careerloom.section', 'jobs')
    mount(<AdvancedPage {...props()} />)
    await userEvent.click(screen.getByRole('button', { name: /Danger zone/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Reset everything…' }))
    const dialog = await screen.findByRole('alertdialog')
    const confirm = within(dialog).getByRole('button', { name: 'Reset everything' })
    expect(confirm).toBeDisabled()
    await userEvent.type(within(dialog).getByLabelText(/Type RESET/), 'RESET')
    expect(confirm).toBeEnabled()
    await userEvent.click(confirm)
    await waitFor(() => expect(bridge.current.settingsReset).toHaveBeenCalledWith('everything'))
    expect(localStorage.getItem('careerloom.theme')).toBeNull()
    expect(localStorage.getItem('careerloom.section')).toBeNull()
    await waitFor(() => expect(reload).toHaveBeenCalled(), { timeout: 2000 })
  })

  it('reset preferences keeps view state', async () => {
    Object.defineProperty(window, 'location', { value: { ...window.location, reload: vi.fn() }, configurable: true })
    localStorage.setItem('careerloom.theme', 'dark')
    localStorage.setItem('careerloom.section', 'jobs')
    mount(<AdvancedPage {...props()} />)
    await userEvent.click(screen.getByRole('button', { name: 'Reset preferences…' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Reset preferences' }))
    await waitFor(() => expect(bridge.current.settingsReset).toHaveBeenCalledWith('preferences'))
    expect(localStorage.getItem('careerloom.theme')).toBeNull()
    expect(localStorage.getItem('careerloom.section')).toBe('jobs')
  })
})
