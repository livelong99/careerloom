// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ copilotGetConfig: vi.fn(), copilotSetConfig: vi.fn(), copilotStart: vi.fn() }))
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: api }))

import { CONSENT_TEXT_VERSION } from '../../../electron/copilot/consent'
import { DEFAULT_CONFIG_FOR_TESTS } from './testConfig'
import { setSelection } from './selection'
import { ConsentGate } from './ConsentGate'

const gate = (over: Partial<Parameters<typeof ConsentGate>[0]> = {}) => render(<ConsentGate open onOpenChange={vi.fn()} onPractice={vi.fn()} onStarted={vi.fn()} {...over} />)
const start = () => screen.getByRole('button', { name: /start live session/i }) as HTMLButtonElement

beforeEach(() => {
  api.copilotGetConfig.mockResolvedValue(DEFAULT_CONFIG_FOR_TESTS)
  api.copilotStart.mockResolvedValue({ sessionId: 's1' })
  setSelection({ jobId: 'job-1', interviewType: 'behavioural' })
})
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('ConsentGate', () => {
  it('says plainly that providers may keep or train on the text when that setting is on, and not when it is off', async () => {
    const { unmount } = gate()
    await waitFor(() => expect(screen.getByText(/may be retained and used for training by the model provider/i)).toBeTruthy())
    unmount()
    api.copilotGetConfig.mockResolvedValue({ ...DEFAULT_CONFIG_FOR_TESTS, engine: { ...DEFAULT_CONFIG_FOR_TESTS.engine, openrouter: { ...DEFAULT_CONFIG_FOR_TESTS.engine.openrouter, dataCollection: 'deny' } } })
    gate()
    await waitFor(() => expect(screen.getByText(/send the conversation's text to OpenRouter/i)).toBeTruthy())
    expect(screen.queryByText(/used for training/i)).toBeNull()
  })
  it('keeps Start disabled until both statements are confirmed', async () => {
    gate()
    expect(start().disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /allowed to use AI/i }))
    expect(start().disabled).toBe(true)
    fireEvent.click(screen.getByRole('checkbox', { name: /Everyone on this call/i }))
    await waitFor(() => expect(start().disabled).toBe(false))
  })
  it('sends a fresh mic-only consent record for the selected job', async () => {
    const onStarted = vi.fn()
    gate({ onStarted })
    fireEvent.click(screen.getByRole('checkbox', { name: /allowed to use AI/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Everyone on this call/i }))
    await waitFor(() => expect(start().disabled).toBe(false))
    fireEvent.click(start())
    await waitFor(() => expect(api.copilotStart).toHaveBeenCalledOnce())
    const req = api.copilotStart.mock.calls[0]![0] as { mode: string; jobId: string; interviewType: string; consent: Record<string, unknown> }
    expect(req).toMatchObject({ mode: 'live', jobId: 'job-1', interviewType: 'behavioural' })
    expect(req.consent).toMatchObject({ textVersion: CONSENT_TEXT_VERSION, aiAllowedConfirmed: true, everyoneInformedConfirmed: true, sources: ['mic'], llmProvider: 'openrouter' })
    expect(typeof req.consent.sessionId).toBe('string')
    expect(Math.abs((req.consent.at as number) - Date.now())).toBeLessThan(5000)
    await waitFor(() => expect(onStarted).toHaveBeenCalledWith('s1'))
  })
  it('adds system audio only when switched on', async () => {
    gate()
    fireEvent.click(screen.getByRole('switch', { name: /include system audio/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /allowed to use AI/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Everyone on this call/i }))
    await waitFor(() => expect(start().disabled).toBe(false))
    fireEvent.click(start())
    await waitFor(() => expect(api.copilotStart).toHaveBeenCalled())
    expect((api.copilotStart.mock.calls[0]![0] as { consent: { sources: string[] } }).consent.sources).toEqual(['mic', 'system'])
  })
  it('needs a job: explains and stays disabled', () => {
    setSelection({ jobId: null })
    gate()
    expect(screen.getByText(/pick a job on setup/i)).toBeTruthy()
    fireEvent.click(screen.getByRole('checkbox', { name: /allowed to use AI/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Everyone on this call/i }))
    expect(start().disabled).toBe(true)
  })
  it('shows the refusal from main and does not close', async () => {
    api.copilotStart.mockRejectedValue(new Error('Your confirmation expired: confirm again'))
    const onOpenChange = vi.fn()
    gate({ onOpenChange })
    fireEvent.click(screen.getByRole('checkbox', { name: /allowed to use AI/i }))
    fireEvent.click(screen.getByRole('checkbox', { name: /Everyone on this call/i }))
    await waitFor(() => expect(start().disabled).toBe(false))
    fireEvent.click(start())
    expect((await screen.findByRole('alert')).textContent).toMatch(/expired/)
    expect(onOpenChange).not.toHaveBeenCalledWith(false)
  })
  it('Practice instead hands over to practice; Esc closes', () => {
    const onPractice = vi.fn(), onOpenChange = vi.fn()
    gate({ onPractice, onOpenChange })
    fireEvent.click(screen.getByRole('button', { name: /practice instead/i }))
    expect(onPractice).toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(onOpenChange).toHaveBeenCalledWith(false)
  })
})
