// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  listJobs: vi.fn(), copilotGetConfig: vi.fn(), copilotSetConfig: vi.fn(), copilotReadiness: vi.fn(), copilotPracticeQuestions: vi.fn(), copilotStart: vi.fn(),
  kbSummary: vi.fn(), interviewConfig: vi.fn(), interviewVoices: vi.fn(), interviewPlanPreview: vi.fn(), interviewPreviewVoice: vi.fn(), onCopilotEvent: vi.fn(() => () => {}),
}))
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: api }))

import { DEFAULT_CONFIG_FOR_TESTS } from '@/components/copilot/testConfig'
import { resetInterviewForm } from '@/components/copilot/interviewForm'
import { practiseKb } from '@/components/kb/practice'
import { setPracticePick, setSelection } from '@/components/copilot/selection'
import { startPractice } from '@/components/copilot/startActions'
import type { JobListing, KbSummary, VoiceInfo } from '@/lib/types'
import { PracticePage } from './Practice'

const job: JobListing = { id: 'j1', url: 'j1', title: 'Senior Platform Engineer', company: 'Northwind Labs', portalId: null, ats: null, location: null, postedAt: null, firstSeen: null, trustScore: null, trustFlags: [], state: 'evaluated', status: null, score: 4.3, reportNum: 1, reportPath: 'r.md', evaluatedAt: null, stale: false }
const kb: KbSummary = { jobId: 'j1', status: 'complete', researchedAt: 1, items: 46, sourcedPct: 64, sources: 20, costUsd: 0.13, inputChanged: false, runId: null, coverage: [{ skillId: 'k8s', name: 'Kubernetes', have: 6, need: 6, expected: 'working', inCv: false }, { skillId: 'py', name: 'Python', have: 8, need: 6, expected: 'strong', inCv: true }] }
const voice = (id: string, over: Partial<VoiceInfo> = {}): VoiceInfo => ({ engine: 'system', id, name: `${id} · English (India)`, lang: 'en-IN', offline: true, installed: true, sizeMb: null, note: null, ...over })

beforeEach(() => {
  api.listJobs.mockResolvedValue([job])
  api.copilotGetConfig.mockResolvedValue(DEFAULT_CONFIG_FOR_TESTS)
  api.copilotReadiness.mockResolvedValue({ context: { jobId: 'j1', title: job.title, company: job.company, hasPosting: true, hasReport: true, hasCv: true, stories: 6 }, mic: 'granted', system: 'granted', stt: 'ready', engine: 'ready' })
  api.copilotPracticeQuestions.mockResolvedValue([{ id: 'q1', text: 'Tell me about a migration.', type: 'behavioural', source: 'report', lastScore: null }])
  api.kbSummary.mockResolvedValue(kb)
  api.interviewConfig.mockResolvedValue({ voice: { engine: 'system', voiceId: null, speed: 1, echo: 'speakers', tailMs: 500, pushToInterrupt: '' } })
  api.interviewVoices.mockResolvedValue([voice('Aman'), voice('Tara'), voice('Kokoro', { engine: 'kokoro', installed: false, offline: true, sizeMb: 80, lang: 'en-GB', name: 'Kokoro · British' })])
  api.interviewPlanPreview.mockResolvedValue({ questions: 8, sourced: 6, usd: 0.04, minutes: 30 })
  api.copilotStart.mockResolvedValue({ sessionId: 's1' })
  setSelection({ jobId: 'j1', interviewType: 'behavioural' })
  setPracticePick({ ids: null, custom: [] })
  resetInterviewForm()
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('Practice with a question base', () => {
  it('shows the six interview types, focus skills (gaps marked), voices and the session summary', async () => {
    render(<PracticePage />)
    const modes = await screen.findByRole('radiogroup', { name: 'Interview type' })
    expect(modes.querySelectorAll('[role=radio]')).toHaveLength(6)
    expect(screen.getByRole('radio', { name: /Mixed loop/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByRole('button', { name: /Kubernetes/ }).textContent).toMatch(/gap on your résumé/)
    expect(await screen.findByText('8 + follow-ups')).toBeTruthy()
    expect(screen.getByText(/46 questions · 64% sourced/)).toBeTruthy()
    expect(screen.getByRole('radio', { name: /Aman/ }).getAttribute('aria-checked')).toBe('true')
    expect(screen.getByText(/AI-generated/)).toBeTruthy()
  })

  it('starts with the chosen plan: mode, focus skill, generated filter, installed voice', async () => {
    render(<PracticePage />)
    fireEvent.click(await screen.findByRole('radio', { name: /Technical depth/ }))
    fireEvent.click(screen.getByRole('button', { name: /Kubernetes/ }))
    fireEvent.click(screen.getByRole('switch', { name: 'Include generated questions' }))
    fireEvent.click(screen.getByRole('radio', { name: 'No limit' }))
    fireEvent.click(await screen.findByRole('button', { name: /Start practice/ }))
    await waitFor(() => expect(api.copilotStart).toHaveBeenCalledTimes(1))
    const req = api.copilotStart.mock.calls[0]![0]
    expect(req).toMatchObject({ mode: 'practice', jobId: 'j1', interviewType: 'technical' })
    expect(req.interview).toMatchObject({ mode: 'technical', minutes: null, focusSkills: ['k8s'], includeGenerated: false, voice: { engine: 'system', voiceId: 'Aman' } })
    expect(req.questionIds).toBeUndefined()
  })

  it('starts from the Settings voice defaults (speed, headphones, voice)', async () => {
    api.interviewConfig.mockResolvedValue({ voice: { engine: 'system', voiceId: 'Tara', speed: 1.2, echo: 'headphones', tailMs: 500, pushToInterrupt: '' } })
    render(<PracticePage />)
    await waitFor(() => expect(screen.getByRole('radio', { name: /Tara/ }).getAttribute('aria-checked')).toBe('true'))
    fireEvent.click(await screen.findByRole('button', { name: /Start practice/ }))
    await waitFor(() => expect(api.copilotStart).toHaveBeenCalledTimes(1))
    expect(api.copilotStart.mock.calls[0]![0].interview).toMatchObject({ voice: { voiceId: 'Tara', speed: 1.2 }, echo: 'headphones' })
  })

  it("'Practise this question' from the KB tab pins the session to those items; a different job drops the pin", async () => {
    practiseKb('j1', ['i1', 'i2'])
    render(<PracticePage />)
    expect(await screen.findByText(/Practising 2 chosen questions/)).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /Start practice/ }))
    await waitFor(() => expect(api.copilotStart).toHaveBeenCalledTimes(1))
    expect(api.copilotStart.mock.calls[0]![0].interview.itemIds).toEqual(['i1', 'i2'])
    fireEvent.click(screen.getByRole('button', { name: 'Use the whole base' }))
    expect(screen.queryByText(/chosen questions/)).toBeNull()
  })

  it('an uninstalled voice cannot be chosen; previewing calls main', async () => {
    render(<PracticePage />)
    const kokoro = await screen.findByRole('radio', { name: /Kokoro/ })
    expect((kokoro as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(screen.getByRole('button', { name: 'Preview Tara · English (India)' }))
    expect(api.interviewPreviewVoice).toHaveBeenCalledWith('system', 'Tara', 1)
  })

  it('shows main’s message when the plan cannot run, and disables Start for an empty plan', async () => {
    api.interviewPlanPreview.mockResolvedValue({ questions: 0, sourced: 0, usd: 0, minutes: 0 })
    render(<PracticePage />)
    const start = await screen.findByRole('button', { name: /Start practice/ })
    await waitFor(() => expect((start as HTMLButtonElement).disabled).toBe(true))
  })

  it('can switch to the report questions, which start without an interview plan', async () => {
    render(<PracticePage />)
    fireEvent.click(await screen.findByRole('radio', { name: 'Report questions' }))
    await screen.findByText('Tell me about a migration.')
    await startPractice()
    expect(api.copilotStart.mock.calls[0]![0].interview).toBeUndefined()
  })
})

describe('Practice without a question base', () => {
  it('falls back to the report questions with a way to research the job', async () => {
    api.kbSummary.mockResolvedValue({ status: 'not-implemented', method: 'kbSummary' })
    render(<PracticePage />)
    expect(await screen.findByText('Tell me about a migration.')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Research this job' })).toBeTruthy()
    expect(screen.queryByRole('radiogroup', { name: 'Interview type' })).toBeNull()
    await startPractice()
    expect(api.copilotStart.mock.calls[0]![0].interview).toBeUndefined()
  })
  it('an empty or failing base also falls back', async () => {
    api.kbSummary.mockResolvedValue({ ...kb, items: 0, status: 'none' })
    render(<PracticePage />)
    expect(await screen.findByText('Tell me about a migration.')).toBeTruthy()
    cleanup()
    api.kbSummary.mockRejectedValue(new Error('x'))
    render(<PracticePage />)
    expect(await screen.findByText('Tell me about a migration.')).toBeTruthy()
  })
  it('without any voice the page says captions are the interviewer', async () => {
    api.interviewVoices.mockResolvedValue({ status: 'not-implemented', method: 'interviewVoices' })
    render(<PracticePage />)
    expect(await screen.findByText(/voice is not available in this build yet/)).toBeTruthy()
    fireEvent.click(await screen.findByRole('button', { name: /Start practice/ }))
    await waitFor(() => expect(api.copilotStart).toHaveBeenCalled())
    expect(api.copilotStart.mock.calls[0]![0].interview.voice).toEqual({ engine: 'system', voiceId: 'default', speed: 1 })
  })
})
