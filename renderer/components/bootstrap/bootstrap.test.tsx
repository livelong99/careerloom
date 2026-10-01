// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import type { BootstrapStatus, BootstrapStep } from '../../lib/types'

const step = (over: Partial<BootstrapStep>): BootstrapStep => ({ id: 'node', label: 'Node.js', core: true, state: 'pending', detail: null, sizeMb: null, runId: null, error: null, ...over })
const status = (steps: BootstrapStep[], over: Partial<BootstrapStatus> = {}): BootstrapStatus => ({ running: false, coreDone: false, allDone: false, platform: 'darwin', arch: 'arm64', steps, ...over })

let push: (s: BootstrapStatus) => void = () => {}
const bridge = {
  bootstrapStatus: vi.fn(),
  bootstrapStart: vi.fn(),
  onBootstrap: vi.fn((cb: (s: BootstrapStatus) => void) => { push = cb; return () => {} }),
  runLogTail: vi.fn(async () => 'downloading…'),
}
vi.mock('../../lib/ipc', () => ({ careerloom: new Proxy({}, { get: (_t, k: string) => (bridge as Record<string, unknown>)[k] }), normalizeCliError: (e: unknown) => ({ kind: 'error', message: String(e) }) }))

import { SetupStep } from './SetupStep'

beforeEach(() => {
  Object.values(bridge).forEach(f => 'mockClear' in f && f.mockClear())
  Object.assign(navigator, { clipboard: { writeText: vi.fn(async () => {}) } })
})
afterEach(cleanup)

describe('SetupStep', () => {
  it('shows live progress and gates Continue on coreDone', async () => {
    bridge.bootstrapStatus.mockResolvedValue(status([step({ state: 'running', detail: 'Installing', runId: 'r1', sizeMb: 40 }), step({ id: 'stt', label: 'Speech model', core: false, sizeMb: 1500 })]))
    const onNext = vi.fn()
    render(<SetupStep onNext={onNext} />)
    await screen.findByText('Node.js')
    expect(screen.getByText('1.5 GB download')).toBeTruthy()
    expect(screen.getByText('Installing in the background')).toBeTruthy()
    await waitFor(() => expect(bridge.runLogTail).toHaveBeenCalledWith('r1', 4))
    const cont = screen.getByRole('button', { name: 'Continue' }) as HTMLButtonElement
    expect(cont.disabled).toBe(true)
    act(() => push(status([step({ state: 'done' })], { coreDone: true })))
    expect(cont.disabled).toBe(false)
    fireEvent.click(cont)
    expect(onNext).toHaveBeenCalled()
    expect(bridge.bootstrapStart).not.toHaveBeenCalled()
  })

  it('failed step copies the fix prompt, retries, and only non-core can be skipped', async () => {
    const error = { message: 'brew failed', logTail: 'boom', prompt: 'FIX ME' }
    bridge.bootstrapStatus.mockResolvedValue(status([step({ state: 'failed', error }), step({ id: 'stt', label: 'Speech model', core: false, state: 'failed', error })]))
    bridge.bootstrapStart.mockResolvedValue(status([]))
    render(<SetupStep onNext={() => {}} />)
    await screen.findByText('Node.js')
    expect(screen.getAllByRole('button', { name: 'Skip for now' })).toHaveLength(1)
    fireEvent.click(screen.getAllByRole('button', { name: 'Copy fix prompt' })[0]!)
    expect(navigator.clipboard.writeText).toHaveBeenCalledWith('FIX ME')
    fireEvent.click(screen.getAllByRole('button', { name: 'Retry' })[0]!)
    expect(bridge.bootstrapStart).toHaveBeenCalledWith({ retry: 'node' })
    fireEvent.click(screen.getByRole('button', { name: 'Skip for now' }))
    expect(screen.queryByText('Speech model')).toBeNull()
  })
})
