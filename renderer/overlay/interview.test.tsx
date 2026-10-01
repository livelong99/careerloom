// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { Caption } from './Caption'
import { InterviewControls } from './InterviewControls'
import { InterviewerRow } from './InterviewerRow'
import { useInterviewer } from './useInterviewer'

const handlers = new Map<string, (p: unknown) => void>()
beforeEach(() => {
  handlers.clear()
  ;(window as unknown as { careerloom: unknown }).careerloom = { onCopilotEvent: (n: string, cb: (p: unknown) => void) => { handlers.set(n, cb); return () => handlers.delete(n) } }
})
afterEach(() => cleanup())
const emit = (n: string, p: unknown) => act(() => handlers.get(n)!(p))

describe('InterviewerRow', () => {
  it('says in words who is talking, with the voice while speaking', () => {
    const { rerender } = render(<InterviewerRow state="speaking" voice="Aman" />)
    expect(screen.getByRole('status').textContent).toBe('Speaking · Aman')
    rerender(<InterviewerRow state="listening" voice="Aman" />)
    expect(screen.getByRole('status').textContent).toBe('Listening to you')
    rerender(<InterviewerRow state="speaking" voice="default" />)
    expect(screen.getByRole('status').textContent).toBe('Speaking')
  })
})

describe('Caption', () => {
  it('is a polite live region with the question text', () => {
    render(<Caption text="How would you design a rate limiter?" />)
    const el = screen.getByText('How would you design a rate limiter?')
    expect(el.getAttribute('aria-live')).toBe('polite')
  })
  it('shows a waiting line before the first question', () => { render(<Caption text={null} />); expect(screen.getByText(/first question/)).toBeTruthy() })
})

describe('InterviewControls', () => {
  it('has named Replay, Skip and Hint buttons that send their command', () => {
    const onControl = vi.fn()
    render(<InterviewControls onControl={onControl} />)
    for (const name of ['Replay', 'Skip', 'Hint']) fireEvent.click(screen.getByRole('button', { name }))
    expect(onControl.mock.calls.map(c => c[0])).toEqual(['replay', 'skip', 'hint'])
    expect(screen.queryByLabelText('Type your answer')).toBeNull()
  })
  it('the typed-answer box sends trimmed text and clears; empty is disabled', () => {
    const onType = vi.fn()
    render(<InterviewControls onControl={vi.fn()} onType={onType} />)
    const send = screen.getByRole('button', { name: 'Send answer' }) as HTMLButtonElement
    expect(send.disabled).toBe(true)
    const input = screen.getByLabelText('Type your answer') as HTMLInputElement
    fireEvent.change(input, { target: { value: '  my answer  ' } })
    fireEvent.click(send)
    expect(onType).toHaveBeenCalledWith('my answer')
    expect(input.value).toBe('')
  })
})

describe('useInterviewer', () => {
  function Probe() { const v = useInterviewer(); return <p data-testid="p">{v.active ? `${v.state}|${v.voice}|${v.question?.text ?? ''}` : 'inactive'}</p> }
  it('is inactive until main reports an interviewer state, tracks the question, and resets when the session stops', () => {
    render(<Probe />)
    expect(screen.getByTestId('p').textContent).toBe('inactive')
    emit('copilotQuestion', { id: 'q1', text: 'Tell me about X?' })
    expect(screen.getByTestId('p').textContent).toBe('inactive') // a live-mode question does not make it an interview
    emit('interviewerState', { state: 'speaking', questionId: 'q1', voice: 'Aman' })
    expect(screen.getByTestId('p').textContent).toBe('speaking|Aman|Tell me about X?')
    emit('copilotState', { state: 'stopped' })
    expect(screen.getByTestId('p').textContent).toBe('inactive')
  })
  it('does nothing without a bridge', () => {
    ;(window as unknown as { careerloom: unknown }).careerloom = undefined
    render(<Probe />)
    expect(screen.getByTestId('p').textContent).toBe('inactive')
  })
})
