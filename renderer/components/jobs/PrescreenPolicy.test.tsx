// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({ savePrescreenPolicy: vi.fn(), retrainPrescreen: vi.fn() }))
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: api }))
vi.mock('../onboarding/ModelStep', () => ({ LocalModelSetup: () => <div>setup</div> }))

import { NAVIGATE_EVENT } from '@/lib/nav'
import type { PrescreenStatus } from '@/lib/types'
import { PrescreenPolicyEditor } from './PrescreenPolicy'
import { PrescreenSettings } from './prescreen'

const status: PrescreenStatus = {
  available: true, backend: 'verdict-small', reason: null, model: null, groups: ['ISCO 251 Software developers'], labels: { pos: 2, neg: 1 },
  policy: { countries: ['India'], remoteAnywhere: true, years: 6 }, defaults: { countries: ['India'], remoteAnywhere: true, years: 6 },
} as PrescreenStatus
const prescreen = (over = {}) => ({ map: {}, status, busy: false, run: vi.fn(), reloadStatus: vi.fn().mockResolvedValue(undefined), refresh: vi.fn(), ...over })

beforeEach(() => { api.savePrescreenPolicy.mockImplementation(async p => p); api.retrainPrescreen.mockResolvedValue({ personal: false, gain: 0, groups: [], n: 3, pos: 2, neg: 1, trainedAt: '' }) })
afterEach(() => { cleanup(); vi.clearAllMocks() })

describe('PrescreenPolicyEditor (Settings › Jobs)', () => {
  it('edits countries, remote-anywhere and years, then saves and re-screens', async () => {
    const reload = vi.fn().mockResolvedValue(undefined)
    const rescreen = vi.fn().mockResolvedValue(undefined)
    render(<PrescreenPolicyEditor status={status} busy={false} reload={reload} rescreen={rescreen} />)
    fireEvent.change(screen.getByLabelText('Add a country'), { target: { value: 'Germany' } })
    fireEvent.keyDown(screen.getByLabelText('Add a country'), { key: 'Enter' })
    fireEvent.change(screen.getByLabelText('Years of experience'), { target: { value: '8' } })
    fireEvent.click(screen.getByRole('button', { name: /Save and re-screen/ }))
    await waitFor(() => expect(api.savePrescreenPolicy).toHaveBeenCalledWith({ countries: ['India', 'Germany'], remoteAnywhere: true, years: 8 }))
    await waitFor(() => expect(rescreen).toHaveBeenCalled())
    expect(reload).toHaveBeenCalled()
  })
  it('shows Unsaved only while the draft differs and Reset to profile restores defaults', () => {
    render(<PrescreenPolicyEditor status={status} busy={false} reload={vi.fn()} rescreen={vi.fn()} />)
    expect(screen.queryByText('Unsaved')).toBeNull()
    fireEvent.change(screen.getByLabelText('Years of experience'), { target: { value: '3' } })
    expect(screen.getByText('Unsaved')).toBeTruthy()
  })
})

describe('PrescreenSettings popover on Jobs', () => {
  it('is a read-only summary with Retrain and a link to Settings — no policy inputs', async () => {
    const seen = vi.fn()
    window.addEventListener(NAVIGATE_EVENT, e => seen((e as CustomEvent).detail))
    render(<PrescreenSettings status={status} prescreen={prescreen() as never} />)
    fireEvent.click(screen.getByRole('button', { name: /Pre-screen settings/ }))
    expect(await screen.findByText(/India/)).toBeTruthy()
    expect(screen.queryByLabelText('Add a country')).toBeNull()
    expect(screen.getByRole('button', { name: 'Retrain' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: /Manage Pre-screen policy in Settings/ }))
    expect(seen).toHaveBeenCalledWith({ section: 'settings', page: 'jobs', focus: 'prescreen' })
  })
})
