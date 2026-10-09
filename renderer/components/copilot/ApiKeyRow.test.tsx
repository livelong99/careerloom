// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ llmProviders: vi.fn() }))
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: bridge }))

import { NAVIGATE_EVENT } from '@/lib/nav'
import { ApiKeyRow } from './ApiKeyRow'

afterEach(cleanup)

describe('ApiKeyRow', () => {
  it('only shows whether a key is saved and links to the key manager (no input here)', async () => {
    bridge.llmProviders.mockResolvedValue([{ id: 'openrouter', label: 'OpenRouter', hasKey: true, keyOptional: false, needsBaseUrl: false }])
    const seen = vi.fn()
    window.addEventListener(NAVIGATE_EVENT, e => seen((e as CustomEvent).detail))
    render(<ApiKeyRow />)
    expect(await screen.findByText('Saved')).toBeTruthy()
    expect(screen.queryByPlaceholderText('Paste key')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: /Manage in Settings/ }))
    expect(seen).toHaveBeenCalledWith({ section: 'settings', page: 'keys', focus: 'key:openrouter' })
  })
  it('says when no key is saved yet', async () => {
    bridge.llmProviders.mockResolvedValue([{ id: 'openrouter', label: 'OpenRouter', hasKey: false, keyOptional: false, needsBaseUrl: false }])
    render(<ApiKeyRow />)
    expect(await screen.findByText('No key yet')).toBeTruthy()
  })
})
