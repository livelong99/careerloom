// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { clearLocalPrefs } from './localPrefs'

const seed = () => {
  localStorage.setItem('careerloom.theme', 'dark')
  localStorage.setItem('careerloom.locale', 'fr')
  localStorage.setItem('careerloom.refreshInterval', '5m')
  localStorage.setItem('careerloom.section', 'jobs')
  localStorage.setItem('careerloom.copilot.selection', 'x')
  localStorage.setItem('unrelated', 'keep')
}

describe('clearLocalPrefs', () => {
  it('preferences: removes look-and-feel keys only', () => {
    seed()
    expect(clearLocalPrefs('preferences').sort()).toEqual(['careerloom.locale', 'careerloom.refreshInterval', 'careerloom.theme'])
    expect(localStorage.getItem('careerloom.section')).toBe('jobs')
  })
  it('everything: removes every careerloom.* key but nothing else', () => {
    seed()
    clearLocalPrefs('everything')
    expect(Object.keys(localStorage)).toEqual(['unrelated'])
  })
})
