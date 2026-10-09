// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ copilotTestLlmModel: vi.fn(), openExternal: vi.fn() }))
const nav = vi.hoisted(() => ({ goToSettings: vi.fn() }))
vi.mock('@/lib/nav', () => nav)
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: bridge }))

import { isValidModelId, LlmModelPicker } from './LlmModelPicker'

afterEach(() => { cleanup(); bridge.copilotTestLlmModel.mockReset(); bridge.openExternal.mockReset(); nav.goToSettings.mockReset() })

const MODELS = [
  { id: 'a/fast-one', name: 'Fast One', contextTokens: 128000, promptUsdPerM: 0.1, completionUsdPerM: 0.5, dataPolicy: 'no-collect' as const, supportsStreaming: true },
  { id: 'b/big', name: 'Big', contextTokens: 200000, promptUsdPerM: 2, completionUsdPerM: 10, dataPolicy: 'unknown' as const, supportsStreaming: true },
]

describe('isValidModelId', () => {
  it('accepts OpenRouter-style ids only', () => {
    expect(isValidModelId('anthropic/claude-x:free')).toBe(true)
    expect(isValidModelId('')).toBe(false)
    expect(isValidModelId('bad id')).toBe(false)
    expect(isValidModelId('x'.repeat(101))).toBe(false)
  })
})

describe('LlmModelPicker', () => {
  it('lists, searches and picks a model', () => {
    const onChange = vi.fn()
    render(<LlmModelPicker tier="Fast" value={null} models={MODELS} onChange={onChange} />)
    fireEvent.click(screen.getByRole('button', { name: /Change/ }))
    expect(screen.getByText('Fast One')).toBeTruthy()
    expect(screen.getByText("Doesn't collect data")).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Search models'), { target: { value: 'big' } })
    expect(screen.queryByText('Fast One')).toBeNull()
    fireEvent.click(screen.getByText('Big'))
    expect(onChange).toHaveBeenCalledWith('b/big')
  })
  it('without a list, says so and still takes a valid typed id; rejects an invalid one', () => {
    const onChange = vi.fn()
    render(<LlmModelPicker tier="Fast" value={null} models={null} onChange={onChange} allowTyped />)
    fireEvent.click(screen.getByRole('button', { name: /Change/ }))
    expect(screen.getByText('Model list unavailable: type a model id')).toBeTruthy()
    const input = screen.getByLabelText('Model id')
    fireEvent.change(input, { target: { value: 'bad id' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use this id' }))
    expect(onChange).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toMatch(/letters/)
    fireEvent.change(input, { target: { value: 'x/y-1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Use this id' }))
    expect(onChange).toHaveBeenCalledWith('x/y-1')
  })
  it('Test shows first-word time, a failure message, or is disabled when not wired', async () => {
    bridge.copilotTestLlmModel.mockResolvedValueOnce({ ok: true, firstTokenMs: 640 })
    render(<LlmModelPicker tier="Fast" value="a/fast-one" models={MODELS} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    await waitFor(() => expect(screen.getByText('First word 0.6 s')).toBeTruthy())
    bridge.copilotTestLlmModel.mockResolvedValueOnce({ ok: false, firstTokenMs: null, message: 'No key' })
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    await waitFor(() => expect(screen.getByText('No key')).toBeTruthy())
    bridge.copilotTestLlmModel.mockResolvedValueOnce({ status: 'not-implemented', method: 'copilotTestLlmModel' })
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Test' }).hasAttribute('disabled')).toBe(true))
  })

  const FREE = { id: 'q/x:free', name: 'Qwen X (free)', contextTokens: 262144, promptUsdPerM: 0, completionUsdPerM: 0, dataPolicy: 'may-collect' as const, supportsStreaming: true }

  it('labels free/training models and, under the deny policy, warns with a one-click opt-in', () => {
    const onAllow = vi.fn()
    render(<LlmModelPicker tier="Fast" value="q/x:free" models={[FREE, ...MODELS]} dataCollection="deny" onAllowTraining={onAllow} onChange={() => {}} />)
    expect(screen.getAllByText('May use your prompts').length).toBeGreaterThan(0)
    expect(screen.getByRole('status').textContent).toMatch(/privacy setting/i)
    fireEvent.click(screen.getByRole('button', { name: 'Allow free models (they may train on your text)' }))
    expect(onAllow).toHaveBeenCalled()
  })
  it('shows no warning when collection is already allowed, or the model is paid', () => {
    const { rerender } = render(<LlmModelPicker tier="Fast" value="q/x:free" models={[FREE]} dataCollection="allow" onAllowTraining={() => {}} onChange={() => {}} />)
    expect(screen.queryByRole('status')).toBeNull()
    rerender(<LlmModelPicker tier="Fast" value="a/fast-one" models={MODELS} dataCollection="deny" onAllowTraining={() => {}} onChange={() => {}} />)
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('a policy test failure offers Change model and the OpenRouter privacy page', async () => {
    bridge.copilotTestLlmModel.mockResolvedValueOnce({ ok: false, firstTokenMs: null, message: 'May use prompts', code: 'policy', actions: ['change-model', 'privacy-settings'] })
    render(<LlmModelPicker tier="Fast" value="a/fast-one" models={MODELS} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    await waitFor(() => expect(screen.getByText('May use prompts')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: 'Open OpenRouter privacy settings' }))
    expect(bridge.openExternal).toHaveBeenCalledWith('https://openrouter.ai/settings/privacy')
    fireEvent.click(screen.getByRole('button', { name: 'Change model' }))
    expect(screen.getByLabelText('Search models')).toBeTruthy()
  })
  it('a missing-key failure offers Manage key', async () => {
    bridge.copilotTestLlmModel.mockResolvedValueOnce({ ok: false, firstTokenMs: null, message: 'Add your key', code: 'no_key', actions: ['manage-key'] })
    render(<LlmModelPicker tier="Fast" value="a/fast-one" models={MODELS} onChange={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Test' }))
    await waitFor(() => screen.getByRole('button', { name: 'Manage key' }))
    fireEvent.click(screen.getByRole('button', { name: 'Manage key' }))
    expect(nav.goToSettings).toHaveBeenCalledWith('keys', 'key:openrouter')
  })
})
