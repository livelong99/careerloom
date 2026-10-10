// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const api = vi.hoisted(() => ({
  skillsList: vi.fn(), skillsPick: vi.fn(), skillsInspect: vi.fn(), skillsInstall: vi.fn(), skillsSetEnabled: vi.fn(), skillsRemove: vi.fn(), skillsUpdate: vi.fn(), openExternal: vi.fn(),
}))
vi.mock('@/lib/ipc', async orig => ({ ...(await orig<typeof import('@/lib/ipc')>()), careerloom: api }))
vi.mock('../../../lib/ipc', async orig => ({ ...(await orig<typeof import('../../../lib/ipc')>()), careerloom: api }))

import { SkillsPage } from './Skills'
import { settingsFixture } from '../testKit'

const skill = (over = {}) => ({
  id: 'cover-notes', name: 'Cover Notes', description: 'Drafts cover-letter openers.', version: '1.2.0', source: { kind: 'git', url: 'https://github.com/acme/skills', subdir: 'cover' },
  hash: 'h1', path: '/u/skills/cover-notes', enabled: true, installedAt: '2026-01-01', sizeBytes: 2048, hasScripts: false, provides: ['cover-letter'], ...over,
})
const preview = (over = {}) => ({ id: 'cover-notes', name: 'Cover Notes', description: 'Drafts cover-letter openers.', version: '1.3.0', source: { kind: 'git', url: 'https://github.com/acme/skills' }, sizeBytes: 3000, fileCount: 3, scripts: [], provides: [], warnings: [], replaces: false, hash: 'h2', ...over })
const page = () => render(<SkillsPage settings={settingsFixture()} onChanged={() => {}} />)

beforeEach(() => { Object.values(api).forEach(f => f.mockReset()); api.skillsList.mockResolvedValue([]) })

describe('SkillsPage', () => {
  it('explains skills when none are installed and links an example', async () => {
    page()
    await screen.findByText('No skills installed yet')
    fireEvent.click(screen.getByRole('button', { name: 'Browse example skills' }))
    expect(api.openExternal).toHaveBeenCalledWith(expect.stringContaining('github.com'))
  })

  it('lists skills with badges and toggles one', async () => {
    api.skillsList.mockResolvedValue([skill(), skill({ id: 'x', name: 'Scripted', hasScripts: true, enabled: false })])
    api.skillsSetEnabled.mockResolvedValue(skill({ enabled: false }))
    page()
    await screen.findByText('Cover Notes')
    expect(screen.getAllByText('v1.2.0')).toHaveLength(2)
    expect(screen.getByText('Has scripts')).toBeTruthy()
    expect(screen.getAllByText('acme/skills/cover')[0]).toBeTruthy()
    fireEvent.click(screen.getByRole('switch', { name: 'Use Cover Notes in agent runs' }))
    await waitFor(() => expect(api.skillsSetEnabled).toHaveBeenCalledWith('cover-notes', false))
  })

  it('removes only after confirmation', async () => {
    api.skillsList.mockResolvedValue([skill()])
    api.skillsRemove.mockResolvedValue(undefined)
    page()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove Cover Notes' }))
    expect(api.skillsRemove).not.toHaveBeenCalled()
    fireEvent.click(await screen.findByRole('button', { name: 'Remove skill' }))
    await waitFor(() => expect(api.skillsRemove).toHaveBeenCalledWith('cover-notes'))
  })

  it('installs from git: inspect shows the preview, install passes no consent when there are no scripts', async () => {
    api.skillsInspect.mockResolvedValue(preview({ warnings: ['big.bin is a binary file'] }))
    api.skillsInstall.mockResolvedValue(skill())
    page()
    fireEvent.click(await screen.findByRole('button', { name: /Install a skill/ }))
    fireEvent.change(await screen.findByLabelText('Repository'), { target: { value: 'acme/skills' } })
    fireEvent.change(screen.getByLabelText('Branch or tag (optional)'), { target: { value: 'v1' } })
    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }))
    await screen.findByText('big.bin is a binary file')
    expect(api.skillsInspect).toHaveBeenCalledWith({ kind: 'git', url: 'acme/skills', ref: 'v1' })
    fireEvent.click(screen.getByRole('button', { name: 'Install skill' }))
    await waitFor(() => expect(api.skillsInstall).toHaveBeenCalledWith(expect.objectContaining({ kind: 'git' }), { confirmedScripts: false }))
  })

  it('blocks install of a skill with scripts until the consent box is ticked', async () => {
    api.skillsPick.mockResolvedValue('/home/me/my-skill')
    api.skillsInspect.mockResolvedValue(preview({ source: { kind: 'folder', path: '/home/me/my-skill' }, scripts: ['scripts/run.sh'] }))
    api.skillsInstall.mockResolvedValue(skill({ hasScripts: true }))
    page()
    fireEvent.click(await screen.findByRole('button', { name: /Install a skill/ }))
    await userEvent.click(await screen.findByRole('tab', { name: 'Local folder' }))
    fireEvent.click(screen.getByRole('button', { name: 'Choose folder…' }))
    const dialog = await screen.findByRole('dialog')
    await within(dialog).findByText('scripts/run.sh')
    const install = within(dialog).getByRole('button', { name: 'Install skill' })
    expect((install as HTMLButtonElement).disabled).toBe(true)
    fireEvent.click(within(dialog).getByRole('checkbox'))
    expect((install as HTMLButtonElement).disabled).toBe(false)
    fireEvent.click(install)
    await waitFor(() => expect(api.skillsInstall).toHaveBeenCalledWith({ kind: 'folder', path: '/home/me/my-skill' }, { confirmedScripts: true }))
  })

  it('shows the error from a failed inspect', async () => {
    api.skillsInspect.mockRejectedValue({ kind: 'error', message: 'No SKILL.md at the top of this folder.' })
    page()
    fireEvent.click(await screen.findByRole('button', { name: /Install a skill/ }))
    fireEvent.change(await screen.findByLabelText('Repository'), { target: { value: 'a/b' } })
    fireEvent.click(screen.getByRole('button', { name: 'Inspect' }))
    expect((await screen.findByRole('alert')).textContent).toMatch(/No SKILL.md/)
  })

  it('update: up-to-date toast when the hash matches, preview dialog when it changed', async () => {
    api.skillsList.mockResolvedValue([skill()])
    api.skillsUpdate.mockResolvedValueOnce(preview({ hash: 'h1', replaces: true }))
    page()
    fireEvent.click(await screen.findByRole('button', { name: 'Check Cover Notes for updates' }))
    await waitFor(() => expect(api.skillsUpdate).toHaveBeenCalledTimes(1))
    expect(screen.queryByRole('dialog')).toBeNull()
    api.skillsUpdate.mockResolvedValueOnce(preview({ replaces: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Check Cover Notes for updates' }))
    const dialog = await screen.findByRole('dialog')
    expect(within(dialog).getByText('Update Cover Notes')).toBeTruthy()
    expect(within(dialog).getByRole('button', { name: 'Update skill' })).toBeTruthy()
  })
})
