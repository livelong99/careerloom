// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { fakeBridge, WithRuns } from '../components/settings/testKit'
import type { Runs as RunsCtx } from '../hooks/useRuns'
import type { Run } from '../lib/types'

const bridge = vi.hoisted(() => ({ current: null as unknown }))
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: new Proxy({}, { get: (_t, k) => (bridge.current as Record<string, unknown>)[k as string] }) }))
vi.mock('../lib/ipc', async orig => ({ ...(await orig<typeof import('../lib/ipc')>()), careerloom: new Proxy({}, { get: (_t, k) => (bridge.current as Record<string, unknown>)[k as string] }) }))

import { Runs } from './Runs'

const NOW = Date.now()
const run = (o: Partial<Run>): Run => ({ id: 'r', runner: 'claude', mode: 'evaluate', label: 'Evaluate a job', input: null, startedAt: NOW - 60_000, endedAt: NOW - 30_000, status: 'done', ...o })
const RUNS: Run[] = [
  run({ id: 'run-1', label: 'Live scan', mode: 'scan', status: 'running', endedAt: null }),
  run({ id: 'run-2', label: 'Broken eval', status: 'failed', usage: { costUsd: 0.25, inputTokens: 10, outputTokens: 5, turns: 1, durationMs: 1 } }),
  run({ id: 'run-3', label: 'Tailored CV', mode: 'pdf', input: '7' }),
]
const ctx = (over: Partial<RunsCtx> = {}): RunsCtx => ({ runs: RUNS, loaded: true, logs: {}, generation: 0, start: async () => null, evaluate: async () => null, adopt: () => {}, cancel: vi.fn(), forget: vi.fn(async ids => ids.length), ...over })
const setup = (impl: Record<string, unknown> = {}, runs: Partial<RunsCtx> = {}, props: { focusId?: string | null; onFocusHandled?: () => void } = {}) => {
  bridge.current = fakeBridge({ getSettings: { prefs: { retention: { runLogDays: null } } }, listJobs: [], modes: { evaluate: {}, pdf: {} }, getRunLog: '', ...impl })
  const value = ctx(runs)
  render(<WithRuns value={value}><Runs {...props} /></WithRuns>)
  return value
}
const JOB = { id: 'job-9', url: 'https://x.test/9', title: 'Staff Engineer', company: 'Acme', reportNum: 7, score: 4.2, state: 'evaluated', status: 'Evaluated', location: 'Remote', ats: 'greenhouse', postedAt: null, evaluatedAt: null, trustScore: 80, stale: false }
const JOB_RUNS: Run[] = [
  run({ id: 'jr-1', label: 'Evaluate Acme — Staff Engineer', mode: 'evaluate', input: 'https://x.test/9', startedAt: NOW - 50 * 60_000 }),
  run({ id: 'jr-2', label: 'Tailor résumé', mode: 'job-view', jobId: 'job-9', startedAt: NOW - 40 * 60_000 }),
  run({ id: 'jr-3', label: 'Write cover letter', mode: 'job-view', jobId: 'job-9', status: 'failed', startedAt: NOW - 30 * 60_000 }),
  run({ id: 'jr-gone', label: 'Structure job posting', mode: 'job-view', jobId: 'deleted-job', startedAt: NOW - 20 * 60_000 }),
]
const options = () => screen.getAllByRole('option').map(o => o.textContent ?? '')

describe('Runs page', () => {
  beforeEach(() => { bridge.current = null })

  it('lists every run newest-first with totals and selects the first', async () => {
    setup()
    expect(options()).toHaveLength(3)
    expect(screen.getByRole('option', { name: /Live scan/ })).toHaveAttribute('aria-selected', 'true')
    expect(within(screen.getByRole('group', { name: 'Run totals' })).getByText('Failed (all)').nextSibling).toHaveTextContent('1')
    await waitFor(() => expect(screen.getByRole('region', { name: 'Run Live scan' })).toBeTruthy())
  })

  it('narrows the list with the search box and clears the filter again', () => {
    setup()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search runs' }), { target: { value: 'broken' } })
    expect(options()).toHaveLength(1)
    expect(screen.getByText(/1 of 3 runs/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Clear filters' }))
    expect(options()).toHaveLength(3)
  })

  it('shows a message when nothing matches', () => {
    setup()
    fireEvent.change(screen.getByRole('searchbox', { name: 'Search runs' }), { target: { value: 'zzz' } })
    expect(screen.getByText('No runs match these filters.')).toBeTruthy()
  })

  it('opens the run a deep link names, once, whatever the filters were', () => {
    const handled = vi.fn()
    setup({}, {}, { focusId: 'run-3', onFocusHandled: handled })
    expect(screen.getByRole('option', { name: /Tailored CV/ })).toHaveAttribute('aria-selected', 'true')
    expect(screen.getByRole('region', { name: 'Run Tailored CV' })).toBeTruthy()
    expect(handled).toHaveBeenCalledTimes(1)
  })

  it('moves the selection with the arrow keys', () => {
    setup()
    const list = screen.getByRole('listbox', { name: 'Runs' })
    fireEvent.keyDown(list, { key: 'ArrowDown' })
    expect(screen.getByRole('option', { name: /Broken eval/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(list, { key: 'End' })
    expect(screen.getByRole('option', { name: /Tailored CV/ })).toHaveAttribute('aria-selected', 'true')
    fireEvent.keyDown(list, { key: 'ArrowUp' })
    fireEvent.keyDown(list, { key: 'Home' })
    expect(screen.getByRole('option', { name: /Live scan/ })).toHaveAttribute('aria-selected', 'true')
  })

  it('stops a running run', () => {
    const v = setup()
    fireEvent.click(screen.getByRole('button', { name: 'Stop' }))
    expect(v.cancel).toHaveBeenCalledWith('run-1')
  })

  it('never renders a credential from the log, even one the main process failed to hide', async () => {
    const SECRET = 'sk-or-v1-SENTINEL0123456789abcdef0123'
    setup({ getRunLog: `start\nAuthorization: Bearer ${SECRET}\nusing key ${SECRET} for call\nOPENROUTER_API_KEY=${SECRET}\n▸ Read cv.md\nend` })
    await waitFor(() => expect(screen.getByRole('log')).toHaveTextContent('Read cv.md'))
    expect(document.body.textContent).not.toMatch(/SENTINEL/)
    expect(screen.getAllByText(/line hidden/).length).toBe(2)
  })

  it('re-reads a running run\'s log when new output streams in', async () => {
    const getRunLog = vi.fn().mockResolvedValueOnce('first line').mockResolvedValue('first line\nsecond line')
    bridge.current = fakeBridge({ getSettings: { prefs: { retention: { runLogDays: null } } }, listJobs: [], modes: {}, getRunLog })
    const view = (logs: Record<string, string>) => <WithRuns value={ctx({ logs })}><Runs /></WithRuns>
    const { rerender } = render(view({}))
    await waitFor(() => expect(screen.getByRole('log')).toHaveTextContent('first line'))
    rerender(view({ 'run-1': 'second line\n' }))
    await waitFor(() => expect(screen.getByRole('log')).toHaveTextContent('second line'), { timeout: 2000 })
  })

  it('windows a 1500-line log instead of rendering every row', async () => {
    setup({ getRunLog: Array.from({ length: 1500 }, (_, i) => `line ${i}`).join('\n') })
    await waitFor(() => expect(screen.getByText('1,500 lines')).toBeTruthy())
    const rows = screen.getByRole('log').querySelectorAll('.absolute')
    expect(rows.length).toBeGreaterThan(0)
    expect(rows.length).toBeLessThan(200)
  })

  it('deletes a finished run only after confirming', async () => {
    const v = setup({}, {}, { focusId: 'run-2' })
    fireEvent.click(screen.getByRole('button', { name: 'Delete' }))
    expect(v.forget).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete run' }))
    await waitFor(() => expect(v.forget).toHaveBeenCalledWith(['run-2']))
  })

  it('links a report-mode run to its job and the resume workspace', async () => {
    setup({ listJobs: [JOB] }, {}, { focusId: 'run-3' })
    expect(await screen.findByRole('region', { name: 'Job Staff Engineer — Acme' })).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Open resume' })).toBeTruthy()
  })

  describe('job awareness', () => {
    const withJob = (props: { focusId?: string } = {}) => setup({ listJobs: [JOB] }, { runs: [...JOB_RUNS, ...RUNS] }, props)

    it('names the job on each of its runs, with a link to it', async () => {
      withJob()
      const row = await screen.findByRole('option', { name: /Tailor résumé/ })
      expect(row).toHaveTextContent('Staff Engineer — Acme')
      expect(within(row).getByRole('button', { name: 'Open job Staff Engineer — Acme' })).toBeTruthy()
    })

    it('shows a job card (score, status, facts) and the job\'s runs as a timeline in the detail', async () => {
      withJob({ focusId: 'jr-2' })
      const card = await screen.findByRole('region', { name: 'Job Staff Engineer — Acme' })
      expect(card).toHaveTextContent('4.2')
      expect(card).toHaveTextContent('Evaluated')
      expect(card).toHaveTextContent('Remote')
      expect(within(card).getByRole('button', { name: 'Open job' })).toBeTruthy()
      expect(within(card).getByRole('button', { name: 'Open match' })).toBeEnabled()
      const timeline = within(card).getByRole('list', { name: "This job's runs" })
      // the 3 job runs + 'Tailored CV' (pdf, report #7 → the same job)
      expect(within(timeline).getAllByRole('listitem')).toHaveLength(4)
      fireEvent.click(within(timeline).getByRole('button', { name: /Write cover letter · failed/ }))
      expect(screen.getByRole('region', { name: 'Run Write cover letter' })).toBeTruthy()
    })

    it('opens the job page (and its Match tab) from the card', async () => {
      const seen: unknown[] = []
      const on = (e: Event) => seen.push((e as CustomEvent).detail)
      window.addEventListener('careerloom:navigate', on)
      withJob({ focusId: 'jr-2' })
      const card = await screen.findByRole('region', { name: 'Job Staff Engineer — Acme' })
      fireEvent.click(within(card).getByRole('button', { name: 'Open match' }))
      window.removeEventListener('careerloom:navigate', on)
      expect(seen).toEqual([{ section: 'job', id: 'job-9' }])
      expect(sessionStorage.getItem('careerloom.job.tab')).toBe('match')
    })

    it('groups by job: a timeline per job, runs without one under "No job"', async () => {
      withJob()
      await screen.findByRole('option', { name: /Tailor résumé/ })
      fireEvent.click(screen.getByRole('tab', { name: 'Job' }))
      const groups = screen.getAllByRole('group').filter(g => g.id === '' && g.getAttribute('aria-labelledby'))
      expect(groups.map(g => g.firstElementChild?.textContent)).toEqual([expect.stringContaining('Staff Engineer — Acme'), expect.stringContaining('No job')])
      const titles = within(groups[0]!).getAllByRole('option').map(o => o.querySelector('span')?.textContent)
      expect(titles).toEqual(['Evaluate Acme — Staff Engineer', 'Tailor résumé', 'Write cover letter', 'Tailored CV'])
    })

    it('groups by status, and back to a flat list', async () => {
      withJob()
      await screen.findByRole('option', { name: /Tailor résumé/ })
      fireEvent.click(screen.getByRole('tab', { name: 'Status' }))
      expect(screen.getAllByRole('group').map(g => g.firstElementChild?.textContent).filter(t => /running|failed|cancelled|done/.test(t ?? '')).length).toBeGreaterThanOrEqual(3)
      fireEvent.click(screen.getByRole('tab', { name: 'None' }))
      expect(screen.queryAllByRole('group', { name: /running|failed/ })).toHaveLength(0)
    })

    it('searches by job title and company', async () => {
      withJob()
      await screen.findByRole('option', { name: /Tailor résumé/ })
      fireEvent.change(screen.getByRole('searchbox', { name: 'Search runs' }), { target: { value: 'acme' } })
      expect(options()).toHaveLength(4) // 3 job runs + the report-#7 CV run
      expect(screen.queryByRole('option', { name: /Live scan/ })).toBeNull()
    })

    it('copes with a run whose job is gone: no card, no crash', async () => {
      withJob({ focusId: 'jr-gone' })
      expect(await screen.findByRole('region', { name: 'Run Structure job posting' })).toBeTruthy()
      expect(screen.queryByRole('region', { name: /^Job / })).toBeNull()
    })
  })

  it('shows the empty state and a loading skeleton', () => {
    setup({}, { runs: [] })
    expect(screen.getByText('Nothing has run yet')).toBeTruthy()
  })
  it('shows a skeleton until history has loaded', () => {
    setup({}, { loaded: false, runs: [] })
    expect(screen.getByRole('status')).toHaveTextContent('Loading runs')
  })

  it('offers the retention setting', () => {
    setup()
    expect(screen.getByRole('button', { name: /Manage Log retention in Settings/ })).toBeTruthy()
  })
})
