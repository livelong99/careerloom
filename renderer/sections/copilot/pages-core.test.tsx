// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  listJobs: vi.fn(), copilotGetConfig: vi.fn(), copilotSetConfig: vi.fn(), copilotReadiness: vi.fn(), copilotContextPreview: vi.fn(), copilotSessionsForJob: vi.fn(),
  copilotPracticeQuestions: vi.fn(), copilotStart: vi.fn(), copilotListSessions: vi.fn(), copilotGetSession: vi.fn(), copilotApplyDebrief: vi.fn(), copilotDeleteSession: vi.fn(),
  copilotExportConsents: vi.fn(), onCopilotEvent: vi.fn(() => () => {}),
}))
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: api }))

import { DEFAULT_CONFIG_FOR_TESTS } from '@/components/copilot/testConfig'
import { setPracticePick, setSelection } from '@/components/copilot/selection'
import type { JobListing, SessionDetail, SessionSummary } from '@/lib/types'
import { PracticePage } from './Practice'
import { SessionsPage } from './Sessions'
import { SetupPage } from './Setup'

const job = (id: string, title: string, company: string, over: Partial<JobListing> = {}): JobListing => ({
  id, url: id, title, company, portalId: null, ats: null, location: null, postedAt: null, firstSeen: null, trustScore: null, trustFlags: [], state: 'evaluated', status: null,
  score: 4.3, reportNum: 1, reportPath: 'r.md', evaluatedAt: null, stale: false, ...over,
})
const ses = (id: string, jobId: string, startedAt: number, score: number | null, over: Partial<SessionSummary> = {}): SessionSummary => ({
  id, startedAt, endedAt: startedAt + 600_000, mode: 'practice', jobId, jobTitle: 'Senior Platform Engineer', company: 'Northwind Labs', questions: 4, durationSec: 600, score, ...over,
})
const NOW = Date.now()

beforeEach(() => {
  api.listJobs.mockResolvedValue([job('j1', 'Senior Platform Engineer', 'Northwind Labs'), job('j2', 'Staff Backend Engineer', 'Tessellate', { score: 3.9 })])
  api.copilotGetConfig.mockResolvedValue(DEFAULT_CONFIG_FOR_TESTS)
  api.copilotSetConfig.mockImplementation(async p => ({ ...DEFAULT_CONFIG_FOR_TESTS, ...p }))
  api.copilotReadiness.mockResolvedValue({ context: { jobId: 'j1', title: 'Senior Platform Engineer', company: 'Northwind Labs', hasPosting: true, hasReport: true, hasCv: true, stories: 6 }, mic: 'granted', system: 'denied', stt: 'not-installed', engine: 'ready' })
  api.copilotContextPreview.mockResolvedValue({ tokens: 5200, posting: 9, strengths: 4, gaps: 2, facts: 38, stories: 6, text: 'Role: Senior Platform Engineer' })
  api.copilotSessionsForJob.mockResolvedValue({ sessions: [ses('a', 'j1', NOW, 3.9), ses('b', 'j1', NOW - 86_400_000, 3.6, { mode: 'live' })], trend: [] })
  api.copilotPracticeQuestions.mockResolvedValue([
    { id: 'q1', text: 'Tell me about a migration.', type: 'behavioural', source: 'report', lastScore: 3.6 },
    { id: 'q2', text: 'Design a deploy system.', type: 'system-design', source: 'report', lastScore: null },
  ])
  api.copilotStart.mockResolvedValue({ sessionId: 's1' })
  setSelection({ jobId: 'j1', interviewType: 'behavioural' })
  setPracticePick({ ids: null, custom: [] })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Setup', () => {
  it('lists jobs as a radio group, shows readiness, tiles and earlier sessions for the chosen job', async () => {
    render(<SetupPage />)
    const group = await screen.findByRole('radiogroup', { name: 'Job' })
    expect(within(group).getAllByRole('radio')).toHaveLength(2)
    expect(within(group).getByRole('radio', { name: /Senior Platform Engineer/ }).getAttribute('aria-checked')).toBe('true')
    expect(await screen.findByText('Microphone allowed')).toBeTruthy()
    expect(screen.getByText('System audio needs permission')).toBeTruthy()
    expect(screen.getByText('Speech model not installed yet')).toBeTruthy()
    expect(await screen.findByText('38')).toBeTruthy()
    expect(await screen.findByText(/2 earlier sessions/)).toBeTruthy()
    expect(screen.getByText(/1 practice, 1 live/)).toBeTruthy()
    expect(screen.getByText(/best score/)).toBeTruthy()
  })
  it('has no "no job" option: choosing another job switches the selection', async () => {
    render(<SetupPage />)
    const other = await screen.findByRole('radio', { name: /Staff Backend Engineer/ })
    fireEvent.click(other)
    await waitFor(() => expect(api.copilotReadiness).toHaveBeenCalledWith('j2'))
    expect(screen.queryByText(/no job/i)).toBeNull()
  })
  it('interview type is a radiogroup', async () => {
    render(<SetupPage />)
    const t = await screen.findByRole('radio', { name: 'Technical' })
    fireEvent.click(t)
    expect(t.getAttribute('aria-checked')).toBe('true')
  })
})

describe('Practice', () => {
  it('starts with the ticked questions and your own, and never with an empty list', async () => {
    render(<PracticePage />)
    await screen.findByText('Tell me about a migration.')
    fireEvent.click(screen.getByRole('button', { name: /add your own/i }))
    fireEvent.change(screen.getByLabelText('Your own question'), { target: { value: 'What would you do in month one?' } })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'Design a deploy system.' }))
    const start = screen.getByRole('button', { name: /start practice \(2 questions\)/i })
    fireEvent.click(start)
    await waitFor(() => expect(api.copilotStart).toHaveBeenCalledOnce())
    expect(api.copilotStart.mock.calls[0]![0]).toMatchObject({ mode: 'practice', jobId: 'j1', consent: null, questionIds: ['q1'], custom: ['What would you do in month one?'] })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Tell me about a migration.' }))
    fireEvent.click(screen.getByRole('checkbox', { name: 'What would you do in month one?' }))
    expect((screen.getByRole('button', { name: /start practice \(0 questions\)/i }) as HTMLButtonElement).disabled).toBe(true)
  })
  it('follow-up switch writes config', async () => {
    render(<PracticePage />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Follow-up questions' }))
    await waitFor(() => expect(api.copilotSetConfig).toHaveBeenCalledWith({ practice: { followups: false } }))
  })
})

describe('Sessions', () => {
  const detail = (over: Partial<SessionDetail> = {}): SessionDetail => ({
    ...ses('a', 'j1', NOW, 3.9), transcript: [{ id: 't', speaker: 'you', text: 'We moved forty services.', final: true, t0: NOW, t1: NOW + 1 }],
    questionsList: [{ id: 'q1', text: 'Tell me about a migration.', type: 'behavioural', confidence: 1, at: NOW, auto: false }], suggestions: [],
    scorecard: { structure: 4.2, specifics: 3.8, evidence: 3.5, concision: 4, notes: [{ questionId: 'q1', tip: 'Lead with the result.', suggestedLine: 'Led migration of 40 services.' }] }, ...over,
  })
  beforeEach(() => {
    api.copilotListSessions.mockResolvedValue([ses('a', 'j1', NOW, 3.9), ses('b', 'j1', NOW - 86_400_000, 3.6), ses('c', 'j9', NOW - 5 * 86_400_000, null, { jobTitle: 'Deleted Role', company: 'Gone Inc', mode: 'live' })])
    api.copilotGetSession.mockResolvedValue(detail())
    api.copilotApplyDebrief.mockResolvedValue({ ok: true })
  })
  it('groups two sessions under one job with a trend; a deleted job keeps its snapshot and Open job is disabled', async () => {
    render(<SessionsPage />)
    expect(await screen.findByText('Trend 3.6 → 3.9')).toBeTruthy()
    expect(screen.getByText('Deleted Role')).toBeTruthy()
    expect(screen.getByText('Gone Inc')).toBeTruthy()
    const opens = screen.getAllByRole('button', { name: 'Open job' }) as HTMLButtonElement[]
    await waitFor(() => expect(opens.map(b => b.disabled)).toEqual([false, true]))
    expect(screen.getByText(/kept for/i)).toBeTruthy()
  })
  it('shows the scorecard and applies a tip only on an explicit click', async () => {
    render(<SessionsPage />)
    expect(await screen.findByText('Lead with the result.')).toBeTruthy()
    expect(screen.getByText('4.2')).toBeTruthy()
    expect(api.copilotApplyDebrief).not.toHaveBeenCalled()
    fireEvent.click(screen.getByRole('button', { name: /add to résumé bullets/i }))
    await waitFor(() => expect(api.copilotApplyDebrief).toHaveBeenCalledWith('a', 'q1', 'resume-bullet'))
    fireEvent.click(screen.getByRole('button', { name: /save to job notes/i }))
    await waitFor(() => expect(api.copilotApplyDebrief).toHaveBeenCalledWith('a', 'q1', 'job-note'))
  })
  it('says so when a session was not scored yet, and when the transcript text was removed', async () => {
    api.copilotGetSession.mockResolvedValue(detail({ scorecard: null, transcript: [] }))
    render(<SessionsPage />)
    expect(await screen.findByText(/Scoring this session|Not scored/)).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Reader view' }))
    expect(await screen.findByText(/removed by your retention setting/)).toBeTruthy()
  })
  it('confirms before deleting', async () => {
    api.copilotDeleteSession.mockResolvedValue(3)
    render(<SessionsPage />)
    fireEvent.click(await screen.findByRole('button', { name: 'Delete all sessions' }))
    expect(api.copilotDeleteSession).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Delete' }))
    await waitFor(() => expect(api.copilotDeleteSession).toHaveBeenCalledWith('all'))
  })
})
