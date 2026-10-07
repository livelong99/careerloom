// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  prefsGet: vi.fn(), prefsSet: vi.fn(), localModelStatus: vi.fn(), dataLocations: vi.fn(), resumeOverview: vi.fn(), dataStats: vi.fn(), retentionPrune: vi.fn(),
  getSettings: vi.fn(), prescreenStatus: vi.fn(), prescreenJobs: vi.fn(), savePrescreenPolicy: vi.fn(),
}))
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: api }))
vi.mock('@/components/onboarding/ModelStep', () => ({ LocalModelSetup: () => <div>setup</div> }))

import { NAVIGATE_EVENT } from '@/lib/nav'
import { AgentPage } from './Agent'
import { JobsPage } from './Jobs'
import { MonitoringPage } from './Monitoring'
import { ResumePage } from './Resume'

const PREFS = { updates: { enabled: true }, retention: { runLogDays: null }, docs: { tone: 'warm', length: 'standard', humanize: true }, debug: { dir: null }, evalPipeline: { enabled: false } }
const seen = vi.fn()
beforeEach(() => {
  window.addEventListener(NAVIGATE_EVENT, e => seen((e as CustomEvent).detail))
  api.prefsGet.mockResolvedValue(PREFS)
  api.prefsSet.mockImplementation(async p => ({ ...PREFS, docs: { ...PREFS.docs, ...p.docs }, retention: { ...PREFS.retention, ...p.retention } }))
  api.localModelStatus.mockResolvedValue({ installed: false })
  api.dataLocations.mockResolvedValue([{ id: 'careerOps', label: 'career-ops', path: '/tmp/co' }])
  api.resumeOverview.mockResolvedValue({ activeTemplate: 'classic' })
  api.dataStats.mockResolvedValue({ runs: 4, runLogFiles: 3, runLogBytes: 2_097_152, threads: 1, copilotSessions: 0 })
  api.retentionPrune.mockResolvedValue({ removedFiles: 2, freedBytes: 1_048_576 })
  api.getSettings.mockResolvedValue({ runner: 'codex' })
  api.prescreenStatus.mockResolvedValue({ available: false, backend: null, reason: 'No local model', model: null, groups: [], labels: { pos: 0, neg: 0 }, policy: { countries: ['India'], remoteAnywhere: true, years: null }, defaults: { countries: [], remoteAnywhere: true, years: null }, feedback: {} })
  api.savePrescreenPolicy.mockImplementation(async p => p)
  api.prescreenJobs.mockResolvedValue({ results: { a: {}, b: {} } })
})
afterEach(() => { cleanup(); vi.clearAllMocks(); seen.mockClear() })

describe('Resume & documents', () => {
  it('saves tone, length and humanize through prefs.docs', async () => {
    render(<ResumePage />)
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Humanize' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByText('Formal'))
    await waitFor(() => expect(api.prefsSet).toHaveBeenCalledWith({ docs: { tone: 'formal' } }))
    fireEvent.click(screen.getByText('Short'))
    await waitFor(() => expect(api.prefsSet).toHaveBeenCalledWith({ docs: { length: 'short' } }))
    fireEvent.click(screen.getByRole('switch', { name: 'Humanize' }))
    await waitFor(() => expect(api.prefsSet).toHaveBeenCalledWith({ docs: { humanize: false } }))
  })
  it('shows output folder, template and the ATS model status with a link to Local models', async () => {
    render(<ResumePage />)
    expect(await screen.findByText('/tmp/co/output')).toBeTruthy()
    expect(await screen.findByText('classic')).toBeTruthy()
    expect(await screen.findByText('Not installed')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Manage in Settings' }))
    expect(seen).toHaveBeenCalledWith({ section: 'settings', page: 'local-models', focus: 'local:prescreen' })
  })
  it('tolerates the backend not being ready: clear message, controls disabled', async () => {
    api.prefsGet.mockRejectedValue(new Error('prefsGet is not implemented yet'))
    render(<ResumePage />)
    expect(await screen.findByText(/not implemented yet/)).toBeTruthy()
    expect(screen.getByRole('switch', { name: 'Humanize' }).hasAttribute('disabled')).toBe(true)
  })
  it('reverts and tells you when main refuses a change', async () => {
    api.prefsSet.mockRejectedValue(new Error('nope'))
    render(<ResumePage />)
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Humanize' }).hasAttribute('disabled')).toBe(false))
    fireEvent.click(screen.getByRole('switch', { name: 'Humanize' }))
    await waitFor(() => expect(screen.getByRole('switch', { name: 'Humanize' }).getAttribute('aria-checked')).toBe('true'))
  })
})

describe('Agent', () => {
  it('shows the active runner as a chip, a read-only permission table and entrypoints', async () => {
    render(<AgentPage />)
    const table = screen.getByRole('table', { name: 'Runner permissions' })
    expect(within(table).getAllByRole('row')).toHaveLength(7)
    expect(await within(table).findByText('active')).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: 'Manage Runner in Settings' }))
    expect(seen).toHaveBeenCalledWith({ section: 'settings', page: 'runners', focus: 'runner:codex' })
    expect(within(table).queryAllByRole('checkbox')).toHaveLength(0)
    fireEvent.click(screen.getAllByRole('button', { name: 'Open' })[0]!)
    expect(seen).toHaveBeenCalledWith('agent')
  })
})

describe('Monitoring', () => {
  it('sets run-log retention and prunes on request', async () => {
    api.prefsGet.mockResolvedValue({ ...PREFS, retention: { runLogDays: 30 } })
    render(<MonitoringPage />)
    expect(await screen.findByText(/3 log files, 2\.0 MB/)).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Keep run logs for'), { target: { value: '90' } })
    await waitFor(() => expect(api.prefsSet).toHaveBeenCalledWith({ retention: { runLogDays: 90 } }))
    fireEvent.click(screen.getByRole('button', { name: /Delete older logs now/ }))
    await waitFor(() => expect(api.retentionPrune).toHaveBeenCalled())
  })
  it('cannot prune while retention is forever, and refresh is a read-only chip', async () => {
    render(<MonitoringPage />)
    await waitFor(() => expect((screen.getByLabelText('Keep run logs for') as HTMLSelectElement).disabled).toBe(false))
    expect(screen.getByRole('button', { name: /Delete older logs now/ }).hasAttribute('disabled')).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Manage Refresh in Settings' }))
    expect(seen).toHaveBeenCalledWith({ section: 'settings', page: 'general', focus: 'refresh' })
  })
  it('says so when run-log stats are not available yet', async () => {
    api.dataStats.mockRejectedValue(new Error('dataStats is not implemented yet'))
    render(<MonitoringPage />)
    expect(await screen.findByText(/not implemented yet/)).toBeTruthy()
  })
})

describe('Jobs & boards', () => {
  it('hosts the pre-screen policy editor and model status; saving re-screens', async () => {
    render(<JobsPage />)
    fireEvent.change(await screen.findByLabelText('Years of experience'), { target: { value: '5' } })
    fireEvent.click(screen.getByRole('button', { name: /Save and re-screen/ }))
    await waitFor(() => expect(api.savePrescreenPolicy).toHaveBeenCalledWith({ countries: ['India'], remoteAnywhere: true, years: 5 }))
    await waitFor(() => expect(api.prescreenJobs).toHaveBeenCalled())
    expect(screen.getByText('No local model')).toBeTruthy()
    expect(screen.getByText(/no background schedule/)).toBeTruthy()
  })
  it('turns staged evaluation on and off through prefs.evalPipeline (off by default)', async () => {
    render(<JobsPage />)
    const sw = await screen.findByRole('switch', { name: 'Staged evaluation' })
    await waitFor(() => expect(sw.hasAttribute('disabled')).toBe(false))
    expect(sw.getAttribute('aria-checked')).toBe('false')
    fireEvent.click(sw)
    await waitFor(() => expect(api.prefsSet).toHaveBeenCalledWith({ evalPipeline: { enabled: true } }))
  })
  it('shows a clear message when pre-screen status cannot be read', async () => {
    api.prescreenStatus.mockRejectedValue(new Error('prescreen offline'))
    render(<JobsPage />)
    expect(await screen.findByText(/prescreen offline/)).toBeTruthy()
  })
})
