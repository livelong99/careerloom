// Renderer-side preferences live in localStorage. Reset clears them here; the main-process reset (settingsReset) handles settings.json and keys.
import type { ResetScope } from '../../lib/types'

/** Keys cleared by "Reset preferences": look & feel and the remembered Settings page, nothing about your data. */
export const PREFERENCE_KEYS = ['careerloom.theme', 'careerloom.refreshInterval', 'careerloom.locale', 'careerloom.settingsPage', 'careerloom.updateDismissed'] as const

export function clearLocalPrefs(scope: ResetScope, storage: Storage | undefined = globalThis.localStorage): string[] {
  if (!storage) return []
  try {
    const keys = scope === 'everything'
      ? Object.keys(storage).filter(k => k.startsWith('careerloom.'))
      : PREFERENCE_KEYS.filter(k => storage.getItem(k) !== null)
    keys.forEach(k => storage.removeItem(k))
    return [...keys]
  } catch { return [] } // storage can be unavailable
}
