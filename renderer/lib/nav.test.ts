// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { goToIntegrations, goToSettings, navigate, NAVIGATE_EVENT, openRuns } from './nav'

const last = () => {
  const spy = vi.fn()
  window.addEventListener(NAVIGATE_EVENT, spy)
  return { spy, detail: () => (spy.mock.calls[0]?.[0] as CustomEvent).detail, off: () => window.removeEventListener(NAVIGATE_EVENT, spy) }
}
let listener: ReturnType<typeof last> | null = null
afterEach(() => listener?.off())

describe('navigate', () => {
  it('sends a bare section id when there is nothing to deep-link', () => {
    listener = last(); navigate('jobs'); expect(listener.detail()).toBe('jobs')
  })
  it('keeps id for board deep links', () => {
    listener = last(); navigate('boards', { id: 'b1' }); expect(listener.detail()).toEqual({ section: 'boards', id: 'b1' })
  })
  it('goToSettings carries page and focus', () => {
    listener = last(); goToSettings('keys', 'key:openrouter'); expect(listener.detail()).toEqual({ section: 'settings', page: 'keys', focus: 'key:openrouter' })
  })
  it('routes the retired integrations screen to Settings > Integrations', () => {
    listener = last(); goToIntegrations(); expect(listener.detail()).toEqual({ section: 'settings', page: 'integrations' })
    listener.off(); listener = last(); navigate('integrations'); expect(listener.detail()).toEqual({ section: 'settings', page: 'integrations' })
  })
  it('openRuns deep-links a run, or just opens the page', () => {
    listener = last(); openRuns('r1'); expect(listener.detail()).toEqual({ section: 'runs', id: 'r1' })
    listener.off(); listener = last(); openRuns(); expect(listener.detail()).toBe('runs')
    listener.off(); listener = last(); openRuns({ not: 'a string' }); expect(listener.detail()).toBe('runs')
  })
})
