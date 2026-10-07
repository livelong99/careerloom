// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ copilotGetConfig: vi.fn(), copilotSetConfig: vi.fn(), copilotCheckHotkey: vi.fn() }))
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: api }))
const toast = vi.hoisted(() => vi.fn())
vi.mock('@/lib/toast', async orig => ({ ...(await orig<typeof import('@/lib/toast')>()), showToast: toast }))

import { HotkeysPage } from './Hotkeys'
import { mergeConfig } from '@/components/copilot/api'
import { DEFAULT_CONFIG_FOR_TESTS } from '@/components/copilot/testConfig'
import { defaultHotkeys } from '../../../electron/copilot/hotkey-defaults'

const setPlatform = (p?: string): void => { (window as unknown as { codeburn?: { platform: string } }).codeburn = p ? { platform: p } : undefined }
const record = async (row: string, ev: object): Promise<void> => {
  fireEvent.click(await screen.findByRole('button', { name: row }))
  fireEvent.keyDown(screen.getByRole('button', { name: /Press the new shortcut/ }), ev)
}

beforeEach(() => {
  const cfg = { ...DEFAULT_CONFIG_FOR_TESTS, hotkeys: { ...DEFAULT_CONFIG_FOR_TESTS.hotkeys, ...defaultHotkeys('win32') } }
  api.copilotGetConfig.mockResolvedValue(cfg)
  api.copilotSetConfig.mockImplementation(async (p: object) => mergeConfig(cfg, p as never))
  api.copilotCheckHotkey.mockResolvedValue({ ok: true })
})
afterEach(() => { cleanup(); setPlatform(); vi.clearAllMocks() })

describe('HotkeysPage rough edges', () => {
  it('on Windows shows words (Alt+Shift+A), the Windows defaults, and Win for the Super key', async () => {
    setPlatform('win32')
    render(<HotkeysPage />)
    expect(await screen.findByText('Alt+Shift+A')).toBeTruthy()
    expect(screen.queryByText(/⌥/)).toBeNull()
    await record('Change Clarify the question', { key: 'q', code: 'KeyQ', metaKey: true })
    await waitFor(() => expect(api.copilotSetConfig).toHaveBeenCalledWith({ hotkeys: { clarify: 'Super+Q' } }))
  })

  it('refuses a duplicate however it is spelled, and names the action that owns it', async () => {
    setPlatform('win32')
    render(<HotkeysPage />)
    // Follow-up already owns Alt+Shift+F; the recorder produces "Alt+Shift+F" for it.
    await record('Change Clarify the question', { key: 'f', code: 'KeyF', altKey: true, shiftKey: true })
    expect(api.copilotSetConfig).not.toHaveBeenCalled()
    expect((await screen.findByRole('alert')).textContent).toMatch(/Alt\+Shift\+F.*Follow-up/)
  })

  it('refuses the stop shortcut and says so', async () => {
    setPlatform('win32')
    render(<HotkeysPage />)
    await record('Change Clarify the question', { key: 'x', code: 'KeyX', altKey: true, shiftKey: true })
    expect((await screen.findByRole('alert')).textContent).toMatch(/Stop everything now/)
  })

  it('confirms a saved change with a toast, and clears an earlier error', async () => {
    setPlatform('win32')
    render(<HotkeysPage />)
    await record('Change Clarify the question', { key: 'f', code: 'KeyF', altKey: true, shiftKey: true })
    await screen.findByRole('alert')
    await record('Change Clarify the question', { key: 'j', code: 'KeyJ', altKey: true, shiftKey: true })
    await waitFor(() => expect(toast).toHaveBeenCalledWith(expect.stringMatching(/Clarify the question.*Alt\+Shift\+J/), 'ok'))
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('tells the user why a bare key or Shift-only press did nothing while recording', async () => {
    setPlatform('win32')
    render(<HotkeysPage />)
    await record('Change Clarify the question', { key: 'j', code: 'KeyJ' })
    expect(screen.getByRole('button', { name: /Press the new shortcut/ }).textContent).toMatch(/Ctrl, Alt or Win/)
  })

  it('says shortcuts work while a session runs, and the Listen row is not a pause', async () => {
    render(<HotkeysPage />)
    expect(await screen.findByText(/only while a session is running/i)).toBeTruthy()
    expect(screen.queryByText('Start or pause listening')).toBeNull()
    expect(screen.getByText('Start listening')).toBeTruthy()
  })
})
