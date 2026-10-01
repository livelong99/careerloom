// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'

import { ActionRow } from './ActionRow'

const keys = { answer: '⌃⌥A', followup: '⌃⌥F', clarify: '⌃⌥C', screenshot: '⌃⌥S', summarise: '⌃⌥M' }
const row = (scr: Parameters<typeof ActionRow>[0]['screen'], on: Parameters<typeof ActionRow>[0]['on'] = {}) => render(<ActionRow keys={keys} screen={scr} on={{ answer: vi.fn(), screenshot: vi.fn(), fixScreen: vi.fn(), ...on }} />)
const btn = (name: RegExp) => screen.getByRole('button', { name })

describe('Screenshot action states', () => {
  it('idle: enabled, sends the screenshot action', () => {
    const screenshot = vi.fn()
    row({ state: 'idle' }, { screenshot })
    fireEvent.click(btn(/^Screenshot/))
    expect(screenshot).toHaveBeenCalledTimes(1)
  })
  it('capturing: disabled, says so', () => {
    row({ state: 'capturing' })
    expect(btn(/Capturing/)).toBeDisabled()
  })
  it('sent: a confirmation, still disabled so a double press cannot double-send', () => {
    row({ state: 'sent' })
    expect(btn(/Sent/)).toBeDisabled()
  })
  it('ready (late frame): offers "Re-answer with screen" and uses the screenshot action', () => {
    const screenshot = vi.fn()
    row({ state: 'ready' }, { screenshot })
    fireEvent.click(btn(/Re-answer with screen/))
    expect(screenshot).toHaveBeenCalledTimes(1)
  })
  it('no permission: the button opens System Settings and the note says why', () => {
    const fixScreen = vi.fn(), screenshot = vi.fn()
    row({ state: 'blocked', reason: 'permission', message: 'Screen Recording is off for Careerloom.' }, { fixScreen, screenshot })
    expect(screen.getByRole('status')).toHaveTextContent('Screen Recording is off')
    fireEvent.click(btn(/Allow screen access/))
    expect(fixScreen).toHaveBeenCalledTimes(1)
    expect(screenshot).not.toHaveBeenCalled()
  })
  it.each([
    ['off', /Screenshots off/], ['ocr', /OCR not available/], ['no-vision', /Not a vision model/], ['budget', /Limit reached/], ['failed', /Capture failed/],
  ] as const)('blocked %s: disabled with its own label and the note', (reason, label) => {
    row({ state: 'blocked', reason, message: `note for ${reason}` })
    expect(btn(label)).toBeDisabled()
    expect(screen.getByRole('status')).toHaveTextContent(`note for ${reason}`)
  })
  it('no note when nothing is wrong', () => {
    row({ state: 'idle' })
    expect(screen.queryByRole('status')).toBeNull()
  })
  it('the other actions are unaffected', () => {
    const answer = vi.fn()
    row({ state: 'capturing' }, { answer })
    fireEvent.click(btn(/^Answer/))
    expect(answer).toHaveBeenCalledWith('answer')
  })
})
