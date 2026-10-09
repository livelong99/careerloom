// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ current: {} as Record<string, ReturnType<typeof vi.fn>> }))
vi.mock('../../lib/ipc', async orig => ({ ...(await orig<typeof import('../../lib/ipc')>()), careerloom: new Proxy({}, { get: (_t, k: string) => bridge.current[k] }) }))
vi.mock('../../lib/platform', () => ({ copilotSupportedHere: () => true, isWindowsPlatform: () => false }))

import { NAVIGATE_EVENT } from '../../lib/nav'
import { LlmAssignments } from './LlmAssignments'
import { fakeBridge, settingsFixture } from './testKit'

const row = (id: string, label: string, hasKey: boolean, over = {}) => ({ id, label, hasKey, keyOptional: false, needsBaseUrl: false, ...over })
const ROWS = [row('openrouter', 'OpenRouter', true), row('openai', 'OpenAI', true), row('groq', 'Groq', false), row('custom', 'Custom', false, { keyOptional: true, needsBaseUrl: true })]
const CONFIG = { engine: { provider: 'openrouter', models: { fast: null, balanced: null, deep: null } } }

beforeEach(() => { globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} } as never; Element.prototype.scrollIntoView ??= () => {}; bridge.current = fakeBridge({ llmProviders: ROWS, copilotGetConfig: CONFIG, copilotSetConfig: CONFIG, llmSet: {}, llmModels: [{ id: 'gpt-4.1' }] }) })
afterEach(cleanup)

describe('LlmAssignments', () => {
  it('lists the features; providers without a key are disabled and point at Keys', async () => {
    render(<LlmAssignments settings={settingsFixture()} onChanged={() => {}} />)
    const helper = (await screen.findByLabelText('Helper provider')) as HTMLSelectElement
    await waitFor(() => expect(helper.options.length).toBeGreaterThan(1))
    const opt = (label: RegExp) => [...helper.options].find(o => label.test(o.text))!
    expect(opt(/Groq/).disabled).toBe(true)
    expect(opt(/Groq/).text).toMatch(/add key/)
    expect(opt(/Custom/).disabled).toBe(true)
    expect(opt(/OpenAI/).disabled).toBe(false)
    expect(screen.getByText('Interview Copilot')).toBeTruthy()
    expect(screen.getByText(/fast models only/i)).toBeTruthy()
  })

  it('choosing a provider saves it for helper calls; "runner" clears it', async () => {
    const onChanged = vi.fn()
    const { rerender } = render(<LlmAssignments settings={settingsFixture()} onChanged={onChanged} />)
    const helper = (await screen.findByLabelText('Helper provider')) as HTMLSelectElement
    await waitFor(() => expect(helper.options.length).toBeGreaterThan(1))
    fireEvent.change(helper, { target: { value: 'openai' } })
    await waitFor(() => expect(bridge.current.llmSet).toHaveBeenCalledWith({ helper: { provider: 'openai', model: null } }))
    expect(onChanged).toHaveBeenCalled()
    rerender(<LlmAssignments settings={settingsFixture({ llm: { helper: { provider: 'openai', model: null }, customBaseUrl: null } })} onChanged={onChanged} />)
    fireEvent.change(await screen.findByLabelText('Helper provider'), { target: { value: '' } })
    await waitFor(() => expect(bridge.current.llmSet).toHaveBeenLastCalledWith({ helper: null }))
  })

  it('saves a typed helper model for the chosen provider', async () => {
    render(<LlmAssignments settings={settingsFixture({ llm: { helper: { provider: 'openai', model: null }, customBaseUrl: null } })} onChanged={() => {}} />)
    fireEvent.click(await screen.findByRole('combobox', { name: 'Helper model' }))
    fireEvent.change(await screen.findByPlaceholderText('Search or type a model id'), { target: { value: 'gpt-4.1-mini' } })
    fireEvent.click(await screen.findByText('Use “gpt-4.1-mini”'))
    await waitFor(() => expect(bridge.current.llmSet).toHaveBeenCalledWith({ helper: { provider: 'openai', model: 'gpt-4.1-mini' } }))
  })

  it('the Copilot row switches provider and resets its models; a keyless provider links to Keys', async () => {
    const seen = vi.fn()
    window.addEventListener(NAVIGATE_EVENT, e => seen((e as CustomEvent).detail))
    render(<LlmAssignments settings={settingsFixture()} onChanged={() => {}} />)
    const cop = (await screen.findByLabelText('Copilot provider')) as HTMLSelectElement
    await waitFor(() => expect(cop.options.length).toBeGreaterThan(1))
    fireEvent.change(cop, { target: { value: 'openai' } })
    await waitFor(() => expect(bridge.current.copilotSetConfig).toHaveBeenCalledWith({ engine: { provider: 'openai', models: { fast: null, balanced: null, deep: null } } }))
  })
})
