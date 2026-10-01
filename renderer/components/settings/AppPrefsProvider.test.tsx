// @vitest-environment jsdom
import { act, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'

import { t, useLocale } from '../../i18n'
import { useRefreshCadence } from '../../lib/refreshCadence'
import { AppPrefsProvider } from './AppPrefsProvider'

function Probe() {
  const { choice, setChoice } = useLocale()
  const c = useRefreshCadence()
  return <>
    <span data-testid="out">{choice}|{c.value}|{String(c.intervalMs)}</span>
    <button onClick={() => setChoice('fr')}>fr</button>
    <button onClick={() => c.setValue('manual')}>manual</button>
  </>
}

describe('AppPrefsProvider', () => {
  it('defaults to system language and the 1 min cadence', () => {
    render(<AppPrefsProvider><Probe /></AppPrefsProvider>)
    expect(screen.getByTestId('out')).toHaveTextContent('system|1m|60000')
  })
  it('persists a language and a cadence choice, Manual meaning no timer', () => {
    render(<AppPrefsProvider><Probe /></AppPrefsProvider>)
    act(() => screen.getByText('fr').click())
    act(() => screen.getByText('manual').click())
    expect(screen.getByTestId('out')).toHaveTextContent('fr|manual|null')
    expect(localStorage.getItem('careerloom.locale')).toBe('fr')
    expect(localStorage.getItem('careerloom.refreshInterval')).toBe('manual')
    expect(document.documentElement.lang).toBe('fr')
    expect(typeof t('Settings')).toBe('string')
  })
  it('restores saved choices at boot', () => {
    localStorage.setItem('careerloom.locale', 'ja')
    localStorage.setItem('careerloom.refreshInterval', '5m')
    render(<AppPrefsProvider><Probe /></AppPrefsProvider>)
    expect(screen.getByTestId('out')).toHaveTextContent('ja|5m|300000')
  })
})
