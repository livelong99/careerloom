// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { AnchorGrid } from './AnchorGrid'

afterEach(cleanup)

describe('AnchorGrid', () => {
  it('is a radiogroup of 9 positions with the current one checked', () => {
    render(<AnchorGrid value="tr" onChange={vi.fn()} />)
    expect(screen.getByRole('radiogroup', { name: 'Overlay position' })).toBeTruthy()
    const radios = screen.getAllByRole('radio')
    expect(radios).toHaveLength(9)
    expect(screen.getByRole('radio', { name: 'Top right' }).getAttribute('aria-checked')).toBe('true')
    expect(radios.filter(r => r.getAttribute('tabindex') === '0')).toHaveLength(1)
  })
  it('arrow keys move selection, clamped at the edges', () => {
    const onChange = vi.fn()
    render(<AnchorGrid value="tr" onChange={onChange} />)
    const tr = screen.getByRole('radio', { name: 'Top right' })
    fireEvent.keyDown(tr, { key: 'ArrowRight' })
    expect(onChange).not.toHaveBeenCalled()
    fireEvent.keyDown(tr, { key: 'ArrowDown' })
    expect(onChange).toHaveBeenLastCalledWith('mr')
    fireEvent.keyDown(tr, { key: 'ArrowLeft' })
    expect(onChange).toHaveBeenLastCalledWith('tc')
  })
  it('click selects', () => {
    const onChange = vi.fn()
    render(<AnchorGrid value="tr" onChange={onChange} />)
    fireEvent.click(screen.getByRole('radio', { name: 'Bottom left' }))
    expect(onChange).toHaveBeenCalledWith('bl')
  })
})
