// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { DEFAULT_CONFIG } from '../../../electron/copilot/config'
import type { OverlayViewState } from '../../../electron/contract'
import { OverlayPreview } from './OverlayPreview'

const show = (state: OverlayViewState, layout: 'strip' | 'panel' = 'panel') => render(<OverlayPreview config={DEFAULT_CONFIG} state={state} layout={layout} theme="dark" />)

describe('OverlayPreview', () => {
  it.each<[OverlayViewState, RegExp]>([
    ['idle', /Ready when you are/], ['listening', /Waiting for a question/], ['question', /Looks like a question/],
    ['answering', /Say first/], ['answered', /Numbers checked against your résumé/], ['permission', /System audio is silent/],
    ['error', /Speech-to-text disconnected/], ['stopped', /Capture stopped/],
  ])('panel %s', (state, text) => {
    show(state)
    expect(screen.getByText(text)).toBeTruthy()
  })

  it('strip shows the question and the Answer button with its hotkey', () => {
    show('question', 'strip')
    expect(screen.getByText(/pushed back on a deadline/)).toBeTruthy()
    expect(screen.getByRole('button', { name: /Answer/ }).textContent).toContain('⌃⌥A')
  })

  it('the listening chip reads from capture state and shows the sample clock', () => {
    const { container } = show('listening')
    expect(container.querySelector('.chipL')?.textContent).toContain('04:12')
  })

  it('the Answer button in a preview is inert (no handler)', () => {
    show('question')
    expect((screen.getAllByRole('button', { name: /Answer/ })[0] as HTMLButtonElement).disabled).toBe(true)
  })
})
