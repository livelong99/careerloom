// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { describe, expect, it, vi } from 'vitest'

import type { InstalledSkill } from '../../../electron/skills/types'
import { Composer, type Outgoing } from './Composer'

const skill = (id: string, name: string, description = ''): InstalledSkill => ({ id, name, description, version: null, source: { kind: 'folder', path: '/x' }, hash: 'h', path: '/x', enabled: true, installedAt: '', sizeBytes: 1, hasScripts: false, provides: [] })
const SKILLS = [skill('resume-tailor', 'Resume tailor', 'Rewrites a CV for a role'), skill('cover-letter', 'Cover letter', 'Drafts a letter')]
const png = (name = 'shot.png', size = 100) => new File([new Uint8Array(size)], name, { type: 'image/png' })

function Harness(props: Partial<React.ComponentProps<typeof Composer>> & { onSend?: (o: Outgoing) => Promise<boolean> }) {
  const [value, setValue] = useState('')
  const [chosen, setChosen] = useState<InstalledSkill[]>([])
  return (
    <Composer
      value={value}
      onChange={setValue}
      onStop={() => {}}
      running={false}
      skills={SKILLS}
      chosen={chosen}
      onChosen={setChosen}
      {...props}
      onSend={props.onSend ?? (async () => true)}
    />
  )
}
const field = () => screen.getByRole('combobox')

describe('Composer images', () => {
  it('attaches by file picker, shows a thumbnail, and removes it', async () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Choose images'), { target: { files: [png('a.png')] } })
    const img = await screen.findByAltText('a.png')
    expect(img).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Remove a.png' }))
    expect(screen.queryByAltText('a.png')).not.toBeInTheDocument()
  })

  it('attaches by paste and by drop', async () => {
    render(<Harness />)
    fireEvent.paste(field(), { clipboardData: { files: [png('pasted.png')] } })
    expect(await screen.findByAltText('pasted.png')).toBeInTheDocument()
    const form = field().closest('form')!
    fireEvent.drop(form, { dataTransfer: { files: [png('dropped.png')], types: ['Files'] } })
    expect(await screen.findByAltText('dropped.png')).toBeInTheDocument()
  })

  it('does not hijack paste of plain text', () => {
    render(<Harness />)
    const notPrevented = fireEvent.paste(field(), { clipboardData: { files: [] } })
    expect(notPrevented).toBe(true)
  })

  it('rejects wrong type, oversize and the 7th image, with a message near the field', async () => {
    render(<Harness />)
    fireEvent.change(screen.getByLabelText('Choose images'), { target: { files: [new File(['x'], 'doc.pdf', { type: 'application/pdf' }), png('big.png', 9 * 1024 * 1024)] } })
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText(/Not a PNG, JPEG, WebP or GIF/)).toBeInTheDocument()
    expect(within(alert).getByText(/Larger than 8 MB/)).toBeInTheDocument()

    fireEvent.change(screen.getByLabelText('Choose images'), { target: { files: Array.from({ length: 6 }, (_, i) => png(`ok${i}.png`)) } })
    await waitFor(() => expect(screen.getAllByRole('img')).toHaveLength(6))
    fireEvent.change(screen.getByLabelText('Choose images'), { target: { files: [png('seventh.png')] } })
    expect(await screen.findByText(/Only 6 images per message/)).toBeInTheDocument()
    expect(screen.queryByAltText('seventh.png')).not.toBeInTheDocument()
  })

  it('sends the images with the text and clears them after acceptance', async () => {
    const onSend = vi.fn(async () => true)
    render(<Harness onSend={onSend} />)
    fireEvent.change(screen.getByLabelText('Choose images'), { target: { files: [png('a.png')] } })
    await screen.findByAltText('a.png')
    await userEvent.type(field(), 'what is this{Enter}')
    await waitFor(() => expect(onSend).toHaveBeenCalledTimes(1))
    const out = (onSend.mock.calls[0] as unknown as [Outgoing])[0]
    expect(out.attachments.map(a => a.name)).toEqual(['a.png'])
    expect(out.attachments[0]!.data.byteLength).toBe(100)
    await waitFor(() => expect(screen.queryByAltText('a.png')).not.toBeInTheDocument())
  })

  it('keeps the images when the send is refused', async () => {
    render(<Harness onSend={async () => false} />)
    fireEvent.change(screen.getByLabelText('Choose images'), { target: { files: [png('a.png')] } })
    await screen.findByAltText('a.png')
    await userEvent.type(field(), 'hi{Enter}')
    await waitFor(() => expect(screen.getByAltText('a.png')).toBeInTheDocument())
  })

  it('blocks Send and says why when the model cannot read images', async () => {
    render(<Harness imageSupport={{ ok: false, reason: 'big-pickle cannot read images — switch model' }} />)
    fireEvent.change(screen.getByLabelText('Choose images'), { target: { files: [png('a.png')] } })
    await screen.findByAltText('a.png')
    await userEvent.type(field(), 'hi')
    expect(screen.getByText(/cannot read images — switch model/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Send/ })).toBeDisabled()
  })
})

describe('Composer keys and skills', () => {
  it('Enter sends, Shift+Enter does not', async () => {
    const onSend = vi.fn(async () => true)
    render(<Harness onSend={onSend} />)
    await userEvent.type(field(), 'one{Shift>}{Enter}{/Shift}two')
    expect(onSend).not.toHaveBeenCalled()
    await userEvent.keyboard('{Enter}')
    expect(onSend).toHaveBeenCalledTimes(1)
  })

  it('Escape stops a running reply', async () => {
    const onStop = vi.fn()
    render(<Harness running onStop={onStop} />)
    await userEvent.type(field(), '{Escape}')
    expect(onStop).toHaveBeenCalled()
  })

  it('/ opens the skill menu, filters, and Enter adds a removable chip without sending', async () => {
    const onSend = vi.fn(async () => true)
    render(<Harness onSend={onSend} />)
    await userEvent.type(field(), 'Help me /res')
    const list = screen.getByRole('listbox', { name: 'Skills' })
    expect(within(list).getAllByRole('option')).toHaveLength(1)
    expect(within(list).getByText('Rewrites a CV for a role')).toBeInTheDocument()
    await userEvent.keyboard('{Enter}')
    expect(onSend).not.toHaveBeenCalled()
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    const chips = screen.getByRole('list', { name: 'Skills for this message' })
    expect(within(chips).getByText('Resume tailor')).toBeInTheDocument()
    expect(field()).toHaveValue('Help me ')
    await userEvent.keyboard('now{Enter}')
    expect((onSend.mock.calls[0] as unknown as [Outgoing])[0].skills).toEqual(['resume-tailor'])
    await waitFor(() => expect(screen.queryByRole('list', { name: 'Skills for this message' })).not.toBeInTheDocument())
  })

  it('arrow keys move through options; Escape closes the menu; chips can be removed', async () => {
    render(<Harness />)
    await userEvent.type(field(), '/')
    expect(screen.getAllByRole('option')).toHaveLength(2)
    await userEvent.keyboard('{ArrowDown}')
    expect(screen.getAllByRole('option')[1]).toHaveAttribute('aria-selected', 'true')
    await userEvent.keyboard('{Escape}')
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument()
    await userEvent.clear(field())
    await userEvent.type(field(), '/cov{Tab}')
    await userEvent.click(screen.getByRole('button', { name: 'Remove skill Cover letter' }))
    expect(screen.queryByRole('list', { name: 'Skills for this message' })).not.toBeInTheDocument()
  })

  it('explains an empty skill list and links to management', async () => {
    const manage = vi.fn()
    render(<Harness skills={[]} onManageSkills={manage} />)
    await userEvent.type(field(), '/')
    expect(screen.getByText(/No skills installed yet/)).toBeInTheDocument()
    fireEvent.mouseDown(screen.getByRole('button', { name: /Manage skills/ }))
    expect(manage).toHaveBeenCalled()
  })
})
