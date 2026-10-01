// @vitest-environment jsdom
// Layout contracts behind the Copilot/Settings overlap fixes (jsdom has no layout, so these pin the classes that carry them).
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'

import { Note, Row } from '../kit/Group'
import { TierCards } from './TierCards'

afterEach(cleanup)

describe('layout contracts', () => {
  it('Row wraps its control under the label instead of crushing the label', () => {
    const { container } = render(<Row label="Width"><input type="range" /></Row>)
    expect(container.firstElementChild!.className).toContain('flex-wrap')
    expect(screen.getByText('Width').parentElement!.className).toContain('min-w-48')
  })
  it('Note breaks long unbroken text (provider error strings)', () => {
    render(<Note tone="warn">x</Note>)
    expect(screen.getByRole('note').className).toContain('[overflow-wrap:anywhere]')
  })
  it('TierCards fit as many columns as the width allows and let the price pill wrap', () => {
    render(<TierCards tier="fast" onTier={() => {}} prices={{ fast: null, balanced: null, deep: null }} />)
    expect(screen.getByRole('group').className).toContain('auto-fit')
    expect(screen.getAllByText('price shown after you pick a model')[0]!.className).toContain('whitespace-normal')
  })
})
