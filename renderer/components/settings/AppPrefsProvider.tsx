import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'

import { effectiveLocale, isLocaleChoice, LocaleContext, setCurrentLocale, type LocaleChoice } from '../../i18n'
import { persistRefreshValue, readRefreshValue, RefreshCadenceContext, refreshValueToMs } from '../../lib/refreshCadence'

export const LOCALE_KEY = 'careerloom.locale'

export function readLocaleChoice(): LocaleChoice {
  try { const v = globalThis.localStorage?.getItem(LOCALE_KEY); return v && isLocaleChoice(v) ? v : 'system' } catch { return 'system' }
}

/** Mounts the language and refresh-cadence contexts that Settings > General edits (both stay in localStorage).
 *  A language switch remounts the subtree (key) so module-level `t()` reads re-resolve. */
export function AppPrefsProvider({ children }: { children: ReactNode }) {
  const [choice, setChoiceState] = useState<LocaleChoice>(readLocaleChoice)
  const [cadence, setCadence] = useState(readRefreshValue)
  const locale = effectiveLocale(choice, typeof navigator === 'undefined' ? undefined : navigator.language)
  setCurrentLocale(locale) // before children render, so their first t() already speaks the chosen language
  useEffect(() => { document.documentElement.lang = locale }, [locale])

  const setChoice = useCallback((next: LocaleChoice) => {
    try { globalThis.localStorage?.setItem(LOCALE_KEY, next) } catch { /* storage can be unavailable */ }
    setChoiceState(next)
  }, [])
  const setValue = useCallback((value: string) => { persistRefreshValue(value); setCadence(value) }, [])
  const localeValue = useMemo(() => ({ locale, choice, setChoice }), [locale, choice, setChoice])
  const cadenceValue = useMemo(() => ({ value: cadence, intervalMs: refreshValueToMs(cadence), setValue }), [cadence, setValue])

  return (
    <LocaleContext.Provider value={localeValue}>
      <RefreshCadenceContext.Provider value={cadenceValue}>
        <div key={locale} style={{ display: 'contents' }}>{children}</div>
      </RefreshCadenceContext.Provider>
    </LocaleContext.Provider>
  )
}

