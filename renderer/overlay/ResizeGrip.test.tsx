// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { clampWidth, ResizeGrip } from './ResizeGrip'

describe('ResizeGrip', () => {
  it('clamps to the panel range the window supports', () => {
    expect([clampWidth(100), clampWidth(440.4), clampWidth(900)]).toEqual([360, 440, 560])
  })

  it('previews while dragging and commits once on release', () => {
    const preview = vi.fn(), commit = vi.fn()
    render(<ResizeGrip width={440} onPreview={preview} onCommit={commit} />)
    const grip = screen.getByRole('separator', { name: 'Resize overlay' })
    grip.setPointerCapture = vi.fn(); grip.releasePointerCapture = vi.fn()
    fireEvent.pointerDown(grip, { clientX: 100, pointerId: 1 })
    fireEvent.pointerMove(grip, { clientX: 140, pointerId: 1 })
    fireEvent.pointerMove(grip, { clientX: 400, pointerId: 1 })
    expect(preview.mock.calls.map(c => c[0])).toEqual([480, 560])
    expect(commit).not.toHaveBeenCalled()
    fireEvent.pointerUp(grip, { clientX: 400, pointerId: 1 })
    expect(commit).toHaveBeenCalledWith(560)
  })

  it('arrow keys resize by 20 px (keyboard access)', () => {
    const commit = vi.fn()
    render(<ResizeGrip width={440} onPreview={vi.fn()} onCommit={commit} />)
    fireEvent.keyDown(screen.getByRole('separator', { name: 'Resize overlay' }), { key: 'ArrowRight' })
    expect(commit).toHaveBeenCalledWith(460)
  })
})
