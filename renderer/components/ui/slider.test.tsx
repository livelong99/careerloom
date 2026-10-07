// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { Slider } from './slider'

describe('Slider', () => {
  it('the focusable role=slider element carries the aria-label', () => {
    globalThis.ResizeObserver ??= class { observe() {} unobserve() {} disconnect() {} }
    render(<Slider aria-label="Length" min={1} max={3} value={[2]} />)
    expect(screen.getByRole('slider', { name: 'Length' })).toBeTruthy()
  })
})
