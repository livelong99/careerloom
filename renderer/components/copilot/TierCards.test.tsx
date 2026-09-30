// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { estimateInterviewUsd, TierCards } from './TierCards'

afterEach(cleanup)

describe('estimateInterviewUsd', () => {
  it('15 answers x (5,000 cached at 10% + 800 fresh input tokens, 300 output tokens)', () => {
    // per answer: 1300 x $0.10/M + 300 x $0.50/M = 0.00028; x15 = 0.0042
    expect(estimateInterviewUsd(0.1, 0.5)).toBeCloseTo(0.0042, 6)
  })
  it('is null without both prices', () => {
    expect(estimateInterviewUsd(null, 0.5)).toBeNull()
    expect(estimateInterviewUsd(0.1, null)).toBeNull()
  })
})

describe('TierCards', () => {
  it('marks the chosen tier, shows estimate or a hint, and reports a pick', () => {
    const onTier = vi.fn()
    render(<TierCards tier="fast" onTier={onTier} prices={{ fast: { prompt: 0.1, completion: 0.5 }, balanced: null, deep: null }} />)
    expect(screen.getByRole('button', { name: /Fast/ }).getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByText('about $0.004 per interview')).toBeTruthy()
    expect(screen.getAllByText('price shown after you pick a model')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /Deep/ }))
    expect(onTier).toHaveBeenCalledWith('deep')
  })
})
