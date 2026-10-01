// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const mac = vi.hoisted(() => ({ value: true }))
vi.mock('@/lib/platform', async orig => ({ ...(await orig<typeof import('@/lib/platform')>()), isMacPlatform: () => mac.value, copilotSupportedHere: () => mac.value }))
vi.mock('@/sections/copilot/Transcription', () => ({ TranscriptionPage: () => <h2>Transcription</h2> }))
vi.mock('@/sections/copilot/Engine', () => ({ EnginePage: () => <h2>Answer engine</h2> }))
const saved = vi.hoisted(() => ({ save: vi.fn(async () => null), config: null as unknown }))
vi.mock('@/components/copilot/api', () => ({ useCopilotConfig: () => ({ config: saved.config, save: saved.save, error: null }) }))
vi.mock('@/sections/copilot/Privacy', () => ({ PrivacyPage: () => <h2>Privacy &amp; consent</h2> }))

import { NAVIGATE_EVENT } from '@/lib/nav'
import { DEFAULT_CONFIG_FOR_TESTS as testConfig } from '@/components/copilot/testConfig'
import { CopilotPage } from './Copilot'

afterEach(cleanup)
saved.config = testConfig

describe('Settings › Copilot', () => {
  it('re-hosts speech, engine and privacy editors under deep-link anchors, and links to the workspace', () => {
    mac.value = true
    const seen = vi.fn()
    window.addEventListener(NAVIGATE_EVENT, e => seen((e as CustomEvent).detail))
    const { container } = render(<CopilotPage />)
    for (const id of ['copilot:stt', 'copilot:engine', 'copilot:faster', 'copilot:privacy']) expect(container.querySelector(`[data-setting-id="${id}"]`)).toBeTruthy()
    expect(screen.getByText('Transcription')).toBeTruthy()
    expect(screen.getByText('Answer engine')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open Copilot' }))
    expect(seen).toHaveBeenCalledWith('copilot')
  })
  it('is macOS and Windows only like the workspace', () => {
    mac.value = false
    render(<CopilotPage />)
    expect(screen.getByText(/macOS and Windows only/)).toBeTruthy()
  })
  it('faster-answers switches patch the config, and early start needs auto answer', () => {
    mac.value = true
    saved.save.mockClear()
    saved.config = { ...testConfig, engine: { ...testConfig.engine, autoAnswer: true } }
    render(<CopilotPage />)
    fireEvent.click(screen.getByRole('switch', { name: 'Speculative start' }))
    expect(saved.save).toHaveBeenCalledWith({ engine: { speculativeStart: true } })
    fireEvent.click(screen.getByRole('tab', { name: 'Rules + decision model' }))
    expect(saved.save).toHaveBeenCalledWith({ engine: { gate: { engine: 'jev' } } })
    cleanup()
    saved.config = testConfig
    render(<CopilotPage />)
    expect((screen.getByRole('switch', { name: 'Speculative start' }) as HTMLButtonElement).disabled).toBe(true)
  })
})
