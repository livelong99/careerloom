import { describe, expect, it } from 'vitest'

import { deriveView, initialOverlayModel, reduceOverlay, type OverlayEvent } from '../../renderer/lib/copilot'
import { FAKE_STATES, fakeAnswerStream, fakeEventsFor } from './overlay-fake'

const view = (events: ReturnType<typeof fakeEventsFor>) =>
  deriveView(events.map(e => ({ type: e.name, payload: e.payload }) as OverlayEvent).reduce(reduceOverlay, initialOverlayModel))

describe('fake overlay event generator', () => {
  it.each(FAKE_STATES)('reproduces the %s state through the real reducer', state => {
    expect(view(fakeEventsFor(state))).toBe(state)
  })

  it('the answer streams in growing chunks and finishes done', () => {
    const steps = fakeAnswerStream()
    expect(steps.length).toBeGreaterThan(3)
    expect(steps.slice(0, -1).every(e => e.name === 'copilotSuggestion' && !e.payload.done)).toBe(true)
    const last = steps.at(-1)
    expect(last?.payload.done).toBe(true)
    expect(steps[0]?.payload.say.length).toBeLessThan((last?.payload.say.length ?? 0) + 1)
  })

  it('fake proof quotes are plainly sample text', () => {
    const last = fakeAnswerStream().at(-1)?.payload
    expect(last?.proof.length).toBeGreaterThan(0)
  })
})
