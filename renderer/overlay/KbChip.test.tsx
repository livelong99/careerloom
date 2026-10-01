// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { KbChip } from './KbChip'

describe('KbChip', () => {
  it('renders nothing without items', () => {
    const { container } = render(<KbChip items={[]} />)
    expect(container).toBeEmptyDOMElement()
  })
  it('labels the source and opens it by id; unsourced items have no link', () => {
    const open = vi.fn()
    render(<KbChip open={open} items={[{ id: 'a', text: 'Explain CAP', sourceId: 's1', source: 'Eng blog' }, { id: 'b', text: 'Design a cache', sourceId: null, source: null }]} />)
    expect(screen.getByRole('note', { name: 'From your question base' })).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Open source: Eng blog' }))
    expect(open).toHaveBeenCalledWith('s1')
    expect(screen.getAllByRole('button')).toHaveLength(1)
  })
})
