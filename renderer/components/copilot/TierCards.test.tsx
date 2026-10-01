// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { estimateInterviewUsd, TierCards } from './TierCards'

afterEach(cleanup)

describe('estimateInterviewUsd', () => {
  it('without a cached rate: 15 answers x (5,800 input + 300 output tokens) at full price', () => {
    // per answer: 5800 x $0.10/M + 300 x $0.50/M = 0.00073; x15 = 0.01095
    expect(estimateInterviewUsd(0.1, 0.5)).toBeCloseTo(0.01095, 6)
  })
  it('with a cached rate, 90% of calls after the first read the 5,000-token prefix at the cached price', () => {
    const cold = (5800 * 0.1 + 300 * 0.5) / 1e6, warm = (800 * 0.1 + 5000 * 0.025 + 300 * 0.5) / 1e6
    expect(estimateInterviewUsd(0.1, 0.5, 0.025)).toBeCloseTo(cold + 14 * (0.9 * warm + 0.1 * cold), 9)
    expect(estimateInterviewUsd(0.1, 0.5, 0.025)!).toBeLessThan(estimateInterviewUsd(0.1, 0.5)!)
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
    expect(screen.getByText('about $0.01 per interview')).toBeTruthy()
    expect(screen.getAllByText('price shown after you pick a model')).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: /Deep/ }))
    expect(onTier).toHaveBeenCalledWith('deep')
  })
})
