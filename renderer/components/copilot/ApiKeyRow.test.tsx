// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ getSettings: vi.fn() }))
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: bridge }))

import { NAVIGATE_EVENT } from '@/lib/nav'
import { ApiKeyRow } from './ApiKeyRow'

afterEach(cleanup)

describe('ApiKeyRow', () => {
  it('only shows whether a key is saved and links to the key manager (no input here)', async () => {
    bridge.getSettings.mockResolvedValue({ hasApiKey: true })
    const seen = vi.fn()
    window.addEventListener(NAVIGATE_EVENT, e => seen((e as CustomEvent).detail))
    render(<ApiKeyRow />)
    expect(await screen.findByText('Saved')).toBeTruthy()
    expect(screen.queryByPlaceholderText('Paste key')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Manage in Settings/ }))
    expect(seen).toHaveBeenCalledWith({ section: 'settings', page: 'keys', focus: 'key:openrouter' })
  })
  it('says when no key is saved yet', async () => {
    bridge.getSettings.mockResolvedValue({ hasApiKey: false })
    render(<ApiKeyRow />)
    expect(await screen.findByText('No key yet')).toBeTruthy()
  })
})
