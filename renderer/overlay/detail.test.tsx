// @vitest-environment jsdom
// More detail in the overlay: its own slot under the answer, never stale, never an error panel; the link in the answer card.
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import type { DetectedQuestion, Suggestion } from '../../electron/contract'
import { deriveView, initialOverlayModel, reduceOverlay, sessionCost, type OverlayModel } from '../lib/copilot'
import { SuggestionCard } from './SuggestionCard'

const q = (id: string): DetectedQuestion => ({ id, text: 'How would you design a cache?', type: 'system-design', confidence: 0.9, at: 0, auto: false })
const sug = (questionId: string, say: string, kind?: 'detail', cost: number | null = 0.002, done = true): Suggestion => ({ questionId, ...(kind ? { kind } : {}), model: 'm', tier: 'balanced', say, bullets: ['why it matters'], star: null, proof: [], flags: [], done, firstTokenMs: 1, totalMs: 2, costUsd: cost })
const live: OverlayModel = { ...initialOverlayModel, session: { state: 'listening', mode: 'live', sessionId: 'S', sources: ['mic'], startedAt: 1 } }
const run = (...events: Parameters<typeof reduceOverlay>[1][]) => events.reduce(reduceOverlay, live)
const answered = () => run({ type: 'copilotQuestion', payload: q('q1') }, { type: 'copilotSuggestion', payload: sug('q1', 'Short.') })

describe('overlay model', () => {
  it('keeps the answer and adds More detail under it; costs count both', () => {
    const m = reduceOverlay(answered(), { type: 'copilotSuggestion', payload: sug('q1', 'Longer.', 'detail', 0.005) })
    expect(m.suggestion?.say).toBe('Short.')
    expect(m.detail?.say).toBe('Longer.')
    expect(sessionCost(m)).toBeCloseTo(0.007, 6)
  })
  it('a detail that arrives after the next question is dropped, and the view stays on the new question', () => {
    const m = run({ type: 'copilotQuestion', payload: q('q1') }, { type: 'copilotSuggestion', payload: sug('q1', 'Short.') }, { type: 'copilotQuestion', payload: q('q2') },
      { type: 'copilotSuggestion', payload: sug('q1', 'Late.', 'detail', null, false) })
    expect(m.detail).toBeNull()
    expect(deriveView(m)).toBe('question')
  })
  it('a new question or Clear drop the detail; a late answer for another question is ignored; the same question keeps it', () => {
    const base = reduceOverlay(answered(), { type: 'copilotSuggestion', payload: sug('q1', 'Longer.', 'detail') })
    expect(reduceOverlay(base, { type: 'copilotQuestion', payload: q('q2') }).detail).toBeNull()
    const late = reduceOverlay(base, { type: 'copilotSuggestion', payload: sug('q2', 'Other.') })
    expect(late.suggestion?.say).toBe('Short.')
    expect(late.detail?.say).toBe('Longer.')
    expect(reduceOverlay(base, { type: 'copilotSuggestion', payload: sug('q1', 'Short, updated.') }).detail?.say).toBe('Longer.')
    expect(reduceOverlay(base, { type: 'copilotCleared', payload: { at: 1 } }).detail).toBeNull()
  })
  it('a new request for the same question (follow-up, clarify, re-answer) drops the old detail; partials of the same answer keep it', () => {
    const s1 = (say: string, done = true) => ({ ...sug('q1', say, undefined, 0.002, done), reqId: 1 })
    const base = run({ type: 'copilotQuestion', payload: q('q1') }, { type: 'copilotSuggestion', payload: s1('Short', false) }, { type: 'copilotSuggestion', payload: { ...sug('q1', 'Long', 'detail', null, false), reqId: 2 } })
    expect(reduceOverlay(base, { type: 'copilotSuggestion', payload: s1('Short.') }).detail?.say).toBe('Long')
    expect(reduceOverlay(base, { type: 'copilotSuggestion', payload: { ...sug('q1', 'Follow-up.'), reqId: 3 } }).detail).toBeNull()
  })
  it('a More detail failure is a note: the answer stays on screen, not the error panel', () => {
    const m = reduceOverlay(answered(), { type: 'copilotError', payload: { kind: 'detail', message: 'More detail failed: rate limited', retrying: false } })
    expect(deriveView(m)).toBe('answered')
    expect(m.detailNote).toMatch(/rate limited/)
    expect(reduceOverlay(m, { type: 'copilotQuestion', payload: q('q2') }).detailNote).toBeNull()
  })
  it('an engine error panel ends when the next question or answer arrives', () => {
    const err = reduceOverlay(answered(), { type: 'copilotError', payload: { kind: 'engine', message: 'boom', retrying: false } })
    expect(deriveView(err)).toBe('error')
    expect(deriveView(reduceOverlay(err, { type: 'copilotQuestion', payload: q('q2') }))).toBe('question')
    expect(reduceOverlay(err, { type: 'copilotSuggestion', payload: sug('q1', 'Retry.') }).error).toBeNull()
  })
  it('More detail pressed before any answer still shows', () => {
    const m = run({ type: 'copilotQuestion', payload: q('q1') }, { type: 'copilotSuggestion', payload: sug('q1', 'Longer.', 'detail') })
    expect(deriveView(m)).toBe('answered')
  })
})

describe('overlay UI', () => {
  it('the answer card offers More detail with its key; the detail card has no link', () => {
    const onMore = vi.fn()
    render(<><SuggestionCard s={sug('q1', 'Short.')} onMore={onMore} moreKbd="⌃⌥D" /><SuggestionCard s={sug('q1', 'Longer.', 'detail')} onMore={onMore} /></>)
    const links = screen.getAllByRole('button', { name: /More detail/ })
    expect(links).toHaveLength(1)
    fireEvent.click(links[0]!)
    expect(onMore).toHaveBeenCalledTimes(1)
    expect(screen.getByText('⌃⌥D')).toBeTruthy()
    expect(screen.getByText(/More detail · keep going with/)).toBeTruthy()
    expect(screen.getByText('Background and likely follow-ups')).toBeTruthy()
  })
  it('compact: only the headline of the answer while the detail is open', () => {
    render(<SuggestionCard s={sug('q1', 'Short.')} compact />)
    expect(screen.getByText('Short.')).toBeTruthy()
    expect(screen.queryByText('why it matters')).toBeNull()
    expect(screen.queryByRole('button', { name: /More detail/ })).toBeNull()
  })
})

describe('More detail · failure after partial text', () => {
  it('the note shows on the half-written detail card, which stops streaming', () => {
    render(<SuggestionCard s={sug('q1', 'Half a sen', 'detail', null, false)} note="More detail failed: connection reset" />)
    expect(screen.getByRole('status').textContent).toMatch(/More detail failed/)
    expect(document.querySelector('.caret')).toBeNull()
    expect(document.querySelector('[aria-busy="true"]')).toBeNull()
  })
  it('a note on the answer card keeps the More detail link as a retry', () => {
    const onMore = vi.fn()
    render(<SuggestionCard s={sug('q1', 'Short.')} onMore={onMore} note="More detail failed: rate limited" />)
    expect(screen.getByRole('status').textContent).toMatch(/rate limited/)
    fireEvent.click(screen.getByRole('button', { name: /More detail/ }))
    expect(onMore).toHaveBeenCalledTimes(1)
  })
})
