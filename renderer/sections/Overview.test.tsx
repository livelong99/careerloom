// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeBridge, WithRuns } from '../components/settings/testKit'
import { NAVIGATE_EVENT } from '../lib/nav'
import { localDateKey } from '../lib/period'

const bridge = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('../lib/ipc', async orig => ({ ...(await orig<typeof import('../lib/ipc')>()), careerloom: new Proxy({}, { get: (_t, k) => (bridge.current as Record<string, unknown>)[k as string] }) }))

import { Overview } from './Overview'

const ago = (n: number) => localDateKey(new Date(Date.now() - n * 86_400_000))
const job = (o: Record<string, unknown>) => ({ id: 'j', url: '', title: 't', company: 'c', portalId: 'p1', ats: null, location: null, postedAt: null, firstSeen: ago(1), trustScore: null, trustFlags: [], state: 'new', status: null, score: null, reportNum: null, reportPath: null, evaluatedAt: null, stale: false, ...o })
const app = (o: Record<string, unknown>) => ({ num: 1, date: ago(1), company: 'c', via: null, role: 'r', score: null, status: 'Applied', pdf: false, report: null, notes: '', ...o })
const METRICS = { range: null, totals: { runs: 4, failed: 1, cancelled: 0, costUsd: 1.5, tokens: 10, avgDurationMs: 1, successRate: 0.75 }, byRunner: [], byMode: [], daily: [], starts: [], funnel: null, velocity: null, findings: [] }

const JOBS = [
  job({ id: 'a', score: 4.6, state: 'evaluated', evaluatedAt: ago(2) }),
  job({ id: 'b', score: 3.2, state: 'evaluated', evaluatedAt: ago(3) }),
  job({ id: 'old', firstSeen: ago(20) }),
]
const APPS = [app({ num: 1, status: 'Interview' }), app({ num: 2, status: 'Applied' })]

const setup = (impl: Record<string, unknown> = {}) => {
  bridge.current = fakeBridge({
    getTracker: APPS, listJobs: JOBS, readPrescreen: {}, listPortals: [{ id: 'p1', name: 'Board One' }], listScans: [], profileStatus: { cv: true, profile: true, portals: true },
    getMetrics: METRICS, ...impl,
  })
  const spy = vi.fn()
  window.addEventListener(NAVIGATE_EVENT, spy)
  render(<WithRuns><Overview onNavigate={vi.fn()} /></WithRuns>)
  return { spy, stop: () => window.removeEventListener(NAVIGATE_EVENT, spy) }
}
const kpi = (label: string) => screen.getByText(label).closest('li') as HTMLElement
const kpiValue = (label: string) => kpi(label).querySelector('.ovx-kpi-v')?.textContent
const filters = () => JSON.parse(localStorage.getItem('careerloom.jobFilters') ?? '{}')

describe('Overview', () => {
  beforeEach(() => { bridge.current = null })

  it('remembers the range and re-queries metrics for it', async () => {
    setup()
    await screen.findByRole('radiogroup', { name: 'Date range' })
    expect(screen.getByRole('radio', { name: '30d' })).toHaveAttribute('aria-checked', 'true')
    await waitFor(() => expect(kpiValue('New jobs')).toBe('3'))
    fireEvent.click(screen.getByRole('radio', { name: '7d' }))
    expect(localStorage.getItem('careerloom.overview.range')).toBe('7d')
    await waitFor(() => expect(kpiValue('New jobs')).toBe('2')) // the job first seen 20 days ago drops out
    const calls = (bridge.current as { getMetrics: { mock: { calls: Array<[{ from: string; to: string } | null]> } } }).getMetrics.mock.calls
    expect(calls.map(c => c[0])).toContainEqual({ from: ago(6), to: ago(0) }) // this period
    expect(calls.map(c => c[0])).toContainEqual({ from: ago(13), to: ago(7) }) // the one before, for deltas
  })

  it('opens Jobs filtered when a pipeline stage is clicked', async () => {
    const { spy, stop } = setup()
    fireEvent.click(await screen.findByRole('button', { name: /^Interview: 1/ }))
    expect(filters().states).toEqual(['interview'])
    expect((spy.mock.calls[0]![0] as CustomEvent).detail).toBe('jobs')
    stop()
  })

  it('opens Jobs on a score band', async () => {
    const { stop } = setup()
    fireEvent.click(await screen.findByRole('button', { name: /^Scores 4\.5–5\.0: 1 job/ }))
    expect(filters()).toMatchObject({ scoreMin: 4.5, scoreMax: 5 })
    stop()
  })

  it('offers the table alternative for the score chart', async () => {
    setup()
    const card = (await screen.findByText('Score distribution')).closest('section') as HTMLElement
    fireEvent.click(within(card).getByRole('button', { name: 'Table' }))
    expect(within(card).getByRole('table')).toBeTruthy()
  })

  it('shows a retry for a widget that failed and recovers', async () => {
    let fail = true
    setup({ getMetrics: () => (fail ? Promise.reject(new Error('metrics down')) : Promise.resolve(METRICS)) })
    const card = (await screen.findByText('Agent cost and runs')).closest('section') as HTMLElement
    await waitFor(() => expect(within(card).getByRole('alert')).toHaveTextContent('metrics down'))
    fail = false
    fireEvent.click(within(card).getByRole('button', { name: 'Try again' }))
    await waitFor(() => expect(within(card).queryByRole('alert')).toBeNull())
  })

  it('shows empty states with a call to action when there is no data', async () => {
    setup({ getTracker: [], listJobs: [], getMetrics: { ...METRICS, totals: { ...METRICS.totals, runs: 0 } } })
    const card = (await screen.findByText('Pipeline')).closest('section') as HTMLElement
    await waitFor(() => expect(within(card).getByRole('button', { name: 'Find jobs' })).toBeTruthy())
  })
})
