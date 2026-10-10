// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import type { ChatThreadSummary } from '../../lib/types'
import { ThreadList } from './ThreadList'
import { formatDuration, ToolSteps } from './ToolSteps'

const t = (id: string, title: string, status: ChatThreadSummary['status'] = 'idle'): ChatThreadSummary => ({ id, title, createdAt: 1, updatedAt: Date.now(), runner: 'claude', status, preview: '' })

describe('ThreadList', () => {
  const setup = (over: Partial<React.ComponentProps<typeof ThreadList>> = {}) => {
    const props = { threads: [t('1', 'Find roles'), t('2', 'Tailor CV', 'running')], selected: null, onSelect: vi.fn(), onNew: vi.fn(), onRename: vi.fn(async () => {}), onDelete: vi.fn(), ...over }
    render(<ThreadList {...props} />)
    return props
  }
  it('searches by title', async () => {
    setup()
    await userEvent.type(screen.getByLabelText('Search conversations'), 'tailor')
    expect(screen.queryByText('Find roles')).not.toBeInTheDocument()
    expect(screen.getByText('Tailor CV')).toBeInTheDocument()
  })
  it('renames inline: Enter saves, Escape cancels', async () => {
    const p = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Rename Find roles' }))
    const box = screen.getByLabelText('Chat name')
    await userEvent.clear(box)
    await userEvent.type(box, 'Berlin roles{Enter}')
    expect(p.onRename).toHaveBeenCalledTimes(1)
    expect(p.onRename).toHaveBeenCalledWith('1', 'Berlin roles')

    await userEvent.click(screen.getByRole('button', { name: 'Rename Find roles' }))
    await userEvent.type(screen.getByLabelText('Chat name'), 'zzz{Escape}')
    expect(p.onRename).toHaveBeenCalledTimes(1)
  })
  it('asks to delete, but not a running chat', async () => {
    const p = setup()
    await userEvent.click(screen.getByRole('button', { name: 'Delete Find roles' }))
    expect(p.onDelete).toHaveBeenCalledWith('1')
    expect(screen.getByRole('button', { name: 'Delete Tailor CV' })).toBeDisabled()
  })
  it('selects with a click', () => {
    const p = setup()
    fireEvent.click(screen.getByText('Find roles'))
    expect(p.onSelect).toHaveBeenCalledWith('1')
  })
})

describe('ToolSteps', () => {
  it('formats durations', () => {
    expect(formatDuration(250)).toBe('250 ms')
    expect(formatDuration(4200)).toBe('4.2 s')
    expect(formatDuration(65_000)).toBe('1 m 5 s')
  })
  it('collapses long runs to the latest step and expands on demand', async () => {
    const steps = Array.from({ length: 5 }, (_, i) => ({ name: 'Read', hint: `f${i}.md` }))
    render(<ToolSteps steps={steps} live={false} />)
    expect(screen.getAllByRole('listitem')).toHaveLength(1)
    await userEvent.click(screen.getByRole('button', { name: /Show 5 steps/ }))
    expect(screen.getAllByRole('listitem')).toHaveLength(5)
  })
  it('marks the live step as running and the rest as done', () => {
    render(<ToolSteps steps={[{ name: 'Read', hint: 'a' }, { name: 'Grep', hint: 'b' }]} live />)
    const items = screen.getAllByRole('listitem')
    expect(items[0]).toHaveTextContent('done')
    expect(items[1]).toHaveTextContent('running')
  })
})
