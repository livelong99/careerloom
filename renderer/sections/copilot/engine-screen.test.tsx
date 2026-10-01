// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => {
  const fns: Record<string, ReturnType<typeof vi.fn>> = {}
  return new Proxy(fns, { get: (t, k: string) => (t[k] ??= vi.fn(async () => ({ status: 'not-implemented', method: k }))) })
})
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: api }))

import { EnginePage } from './Engine'
import { mergeConfig } from '@/components/copilot/api'
import { DEFAULT_CONFIG_FOR_TESTS } from '@/components/copilot/testConfig'

const CONFIG = DEFAULT_CONFIG_FOR_TESTS
beforeEach(() => {
  api.copilotGetConfig.mockResolvedValue(CONFIG)
  api.copilotSetConfig.mockImplementation(async (p: object) => mergeConfig(CONFIG, p as never))
})
afterEach(cleanup)

describe('Settings → Answer engine → screen reading', () => {
  it('is off by default and says what turning it on does', async () => {
    render(<EnginePage />)
    const toggle = await screen.findByRole('switch', { name: 'Read the screen' })
    expect(toggle.getAttribute('aria-checked')).toBe('false')
    expect(screen.getAllByText(/Screen Recording/).length).toBeGreaterThan(0)
    expect(screen.getByText(/model's provider/i)).toBeTruthy()
  })
  it('turning it on saves engine.screenshots, nothing else', async () => {
    render(<EnginePage />)
    fireEvent.click(await screen.findByRole('switch', { name: 'Read the screen' }))
    await waitFor(() => expect(api.copilotSetConfig).toHaveBeenCalledWith({ engine: { screenshots: true } }))
  })
  it('opens the Screen Recording pane from the explainer', async () => {
    render(<EnginePage />)
    fireEvent.click(await screen.findByRole('button', { name: /Open Screen Recording settings/ }))
    expect(api.copilotOpenSystemSettings).toHaveBeenCalledWith('screen')
  })
  it('the OCR choice is labelled as not available instead of silently doing nothing', async () => {
    render(<EnginePage />)
    expect(await screen.findByText(/OCR.*not available yet/i)).toBeTruthy()
  })
})
