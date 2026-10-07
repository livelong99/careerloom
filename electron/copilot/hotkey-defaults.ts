// Pure (no electron import: the Hotkeys page uses it for "Reset"). macOS keeps ⌃⌥ + letter. On Windows Ctrl+Alt is AltGr
// on many European layouts (it types characters and the shortcut never fires), so Windows uses Alt+Shift + letter instead:
// the language switch only fires when Alt+Shift is released with no key between, and browsers/IDEs rarely bind Alt+Shift+letter.
import type { CopilotConfig } from './types'

type Hotkeys = CopilotConfig['hotkeys']
const MAC: Hotkeys = {
  answer: 'Control+Alt+A', followup: 'Control+Alt+F', clarify: 'Control+Alt+C', screenshot: 'Control+Alt+S', summarise: 'Control+Alt+M',
  expand: 'Control+Alt+E', listen: 'Control+Alt+L', toggle: 'Control+Alt+H', quickHide: 'Control+Alt+Shift+H', clear: 'Control+Alt+K', panic: 'Control+Alt+Shift+X',
}
const WIN: Hotkeys = {
  answer: 'Alt+Shift+A', followup: 'Alt+Shift+F', clarify: 'Alt+Shift+C', screenshot: 'Alt+Shift+S', summarise: 'Alt+Shift+M',
  expand: 'Alt+Shift+E', listen: 'Alt+Shift+L', toggle: 'Alt+Shift+H', quickHide: 'Alt+Shift+Q', clear: 'Alt+Shift+K', panic: 'Alt+Shift+X',
}
const MAC_INTERRUPT = 'Control+Alt+I'
const WIN_INTERRUPT = 'Alt+Shift+I'

/** The sandboxed renderer has no `process`: it falls back to the user agent. */
const hostPlatform = (): string => (typeof process !== 'undefined' && process.platform ? process.platform : /Windows/i.test(globalThis.navigator?.userAgent ?? '') ? 'win32' : 'darwin')

export const defaultHotkeys = (platform: string = hostPlatform()): Hotkeys => ({ ...(platform === 'win32' ? WIN : MAC) })
export const defaultInterruptKey = (platform: string = hostPlatform()): string => (platform === 'win32' ? WIN_INTERRUPT : MAC_INTERRUPT)

/** A saved macOS default on Windows becomes the Windows default (an earlier build seeded those); anything the user chose is kept. */
export const migrateHotkey = (key: keyof Hotkeys, saved: string, platform: string = hostPlatform()): string => (platform === 'win32' && saved === MAC[key] ? WIN[key] : saved)
export const migrateInterruptKey = (saved: string, platform: string = hostPlatform()): string => (platform === 'win32' && saved === MAC_INTERRUPT ? WIN_INTERRUPT : saved)
