export type Theme = 'system' | 'light' | 'dark'
const THEME_KEY = 'careerloom.theme'

export function readTheme(): Theme {
  try {
    const v = globalThis.localStorage?.getItem(THEME_KEY)
    return v === 'light' || v === 'dark' ? v : 'system'
  } catch { return 'system' }
}

export function applyTheme(theme: Theme): void {
  if (theme === 'system') delete document.documentElement.dataset.theme
  else document.documentElement.dataset.theme = theme
  try { globalThis.localStorage?.setItem(THEME_KEY, theme) } catch { /* storage can be unavailable */ }
}
