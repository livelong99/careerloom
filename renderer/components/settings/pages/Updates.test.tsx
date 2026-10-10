// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { UpdateProgress, UpdateStatus } from '../../../lib/types'

const mocks = vi.hoisted(() => ({
  getUpdateStatus: vi.fn(), onUpdateStatus: vi.fn(() => () => {}), getUpdateProgress: vi.fn(), onUpdateProgress: vi.fn(() => () => {}),
  installUpdate: vi.fn(), cancelUpdate: vi.fn(), checkForUpdates: vi.fn(), prefsSet: vi.fn(), openExternal: vi.fn(),
}))
vi.mock('../../../lib/ipc', async orig => ({ ...(await orig<typeof import('../../../lib/ipc')>()), careerloom: mocks }))

import { settingsFixture } from '../testKit'
import { UpdatesPage } from './Updates'

const IDLE: UpdateProgress = { phase: 'idle', received: 0, total: 0, message: null }
const NEWER: UpdateStatus = {
  currentVersion: '0.4.0', latestVersion: '0.5.0', updateAvailable: true, tag: 'v0.5.0', notes: '- Faster scans', blocker: null,
  asset: { name: 'Careerloom-0.5.0-arm64.zip', size: 120 * 1024 * 1024, verifiable: true },
}
const mount = () => render(<UpdatesPage settings={settingsFixture()} onChanged={vi.fn()} />)

beforeEach(() => {
  Object.values(mocks).forEach(m => m.mockReset())
  mocks.onUpdateStatus.mockReturnValue(() => {})
  mocks.onUpdateProgress.mockReturnValue(() => {})
  mocks.getUpdateProgress.mockResolvedValue(IDLE)
  mocks.getUpdateStatus.mockResolvedValue(NEWER)
})

describe('UpdatesPage', () => {
  it('offers Update now with the file and size when a release is ready', async () => {
    mount()
    expect(await screen.findByText(/Careerloom-0\.5\.0-arm64\.zip/)).toBeInTheDocument()
    expect(screen.getByText(/checks its SHA-256/)).toBeInTheDocument()
    mocks.installUpdate.mockResolvedValue({ ok: true })
    await userEvent.click(screen.getByRole('button', { name: 'Update now' }))
    expect(mocks.installUpdate).toHaveBeenCalledWith({ force: false })
  })
  it('explains a blocker and offers the release page instead', async () => {
    mocks.getUpdateStatus.mockResolvedValue({ ...NEWER, blocker: 'Move Careerloom to the Applications folder first, then update.' })
    mount()
    expect(await screen.findByText(/Applications folder/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Update now' })).toBeDisabled()
    await userEvent.click(screen.getByRole('button', { name: 'Open release page' }))
    expect(mocks.openExternal).toHaveBeenCalledWith('https://github.com/livelong99/careerloom/releases/tag/v0.5.0')
  })
  it('asks before stopping runs, then forces the update', async () => {
    mocks.installUpdate.mockResolvedValueOnce({ ok: false, reason: 'runs-active', running: 2, message: '' }).mockResolvedValueOnce({ ok: true })
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Update now' }))
    expect(await screen.findByText(/2 runs are in progress/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Update anyway' }))
    await waitFor(() => expect(mocks.installUpdate).toHaveBeenLastCalledWith({ force: true }))
  })
  it('shows download progress with a Cancel button', async () => {
    mocks.getUpdateProgress.mockResolvedValue({ phase: 'downloading', received: 60 * 1024 * 1024, total: 120 * 1024 * 1024, message: null })
    mount()
    expect(await screen.findByText(/Downloading · 60 MB of 120 MB/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(mocks.cancelUpdate).toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Update now' })).toBeNull()
  })
  it('reports a failed update without changing anything', async () => {
    mocks.getUpdateProgress.mockResolvedValue({ phase: 'error', received: 0, total: 0, message: 'The downloaded file does not match its published checksum. Nothing was installed.' })
    mount()
    expect(await screen.findByText(/does not match its published checksum/)).toBeInTheDocument()
  })
  it('warns when the release has no checksum', async () => {
    mocks.getUpdateStatus.mockResolvedValue({ ...NEWER, asset: { ...NEWER.asset!, verifiable: false } })
    mount()
    expect(await screen.findByText(/no published checksum/)).toBeInTheDocument()
  })
})
