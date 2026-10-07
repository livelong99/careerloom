// @vitest-environment jsdom
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const bridge = vi.hoisted(() => ({ current: {} as Record<string, unknown> }))
vi.mock('../../../lib/ipc', async orig => ({
  ...(await orig<typeof import('../../../lib/ipc')>()),
  careerloom: new Proxy({}, { get: (_t, k: string) => bridge.current[k] }),
}))

import { AppPrefsProvider } from '../AppPrefsProvider'
import { fakeBridge, settingsFixture, WithRuns } from '../testKit'
import { AdvancedPage } from './Advanced'
import { dismissToast, getToast } from '../../../lib/toast'

const prefs = (dir: string | null) => ({ ...settingsFixture().prefs, debug: { dir } })
const mount = () => render(<WithRuns><AppPrefsProvider><AdvancedPage settings={settingsFixture()} onChanged={vi.fn()} /></AppPrefsProvider></WithRuns>)
const base = { diagnostics: { rows: [], memory: { totalBytes: 1, freeBytes: 1 } }, getReadiness: {}, revealPath: true }

beforeEach(() => { dismissToast() })

describe('Advanced › Debug log', () => {
  it('turn on: picks a folder, saves it, shows folder row; Open folder reveals exactly that folder', async () => {
    bridge.current = fakeBridge({ ...base, prefsGet: prefs(null), chooseDirectory: '/tmp/dbg', prefsSet: prefs('/tmp/dbg') })
    mount()
    await userEvent.click(await screen.findByRole('button', { name: /Turn on/ }))
    expect(bridge.current.prefsSet).toHaveBeenCalledWith({ debug: { dir: '/tmp/dbg' } })
    await userEvent.click(await screen.findByRole('button', { name: 'Open folder' }))
    expect(bridge.current.revealPath).toHaveBeenCalledWith('/tmp/dbg')
  })
  it('cancelling the folder picker changes nothing', async () => {
    bridge.current = fakeBridge({ ...base, prefsGet: prefs(null), chooseDirectory: null })
    mount()
    await userEvent.click(await screen.findByRole('button', { name: /Turn on/ }))
    expect(bridge.current.prefsSet).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Open folder' })).toBeNull()
  })
  it('an unwritable folder is refused by main: the switch reverts to off and the reason is shown', async () => {
    bridge.current = fakeBridge({ ...base, prefsGet: prefs(null), chooseDirectory: '/root/nope', prefsSet: () => Promise.reject(new Error('EACCES: permission denied')) })
    mount()
    await userEvent.click(await screen.findByRole('button', { name: /Turn on/ }))
    await waitFor(() => expect(getToast()?.text).toMatch(/EACCES/))
    expect(screen.queryByRole('button', { name: 'Open folder' })).toBeNull()
    expect(screen.getByRole('button', { name: /Turn on/ })).toBeTruthy()
  })
  it('turn off sends dir:null; change picks another folder', async () => {
    bridge.current = fakeBridge({ ...base, prefsGet: prefs('/tmp/a'), chooseDirectory: '/tmp/b', prefsSet: (p: { debug: { dir: string | null } }) => Promise.resolve(prefs(p.debug.dir)) })
    mount()
    await userEvent.click(await screen.findByRole('button', { name: 'Change…' }))
    expect(bridge.current.prefsSet).toHaveBeenLastCalledWith({ debug: { dir: '/tmp/b' } })
    await userEvent.click(await screen.findByRole('button', { name: 'Turn off' }))
    expect(bridge.current.prefsSet).toHaveBeenLastCalledWith({ debug: { dir: null } })
    expect(await screen.findByRole('button', { name: /Turn on/ })).toBeTruthy()
  })
  it('warns that the log contains transcripts', async () => {
    bridge.current = fakeBridge({ ...base, prefsGet: prefs('/tmp/a') })
    mount()
    expect(await screen.findByText(/Transcripts, questions and answers are included/)).toBeTruthy()
  })
})
