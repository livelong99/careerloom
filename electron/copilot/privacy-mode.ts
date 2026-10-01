// Privacy mode (plan §3.5): the ONE file that owns every low-profile window flag. Opt-in, OFF by default.
// No electron runtime import on purpose: the renderer imports the constants/helpers, main injects the Dock.
import type { BrowserWindow } from 'electron'

import type { CopilotConfig } from './types'

type Mode = CopilotConfig['privacy']['mode']
type WinLike = Pick<BrowserWindow, 'setContentProtection' | 'setTitle' | 'isDestroyed'>
/** `app.dock` on macOS; absent elsewhere. */
export type DockLike = { hide(): void; show(): Promise<void> | void }

/** Bump when the notice text changes: every user sees it again and main ignores the flags until they ack. */
export const PRIVACY_NOTICE_VERSION = 'privacy-notice-v1'
/** Window titles are constants, never job/company/question text. */
export const OVERLAY_TITLE = 'Careerloom Copilot'
export const NEUTRAL_TITLE = 'Careerloom'

/** Flags count only when the master switch is on AND the current notice was acknowledged (checked in main). */
export function privacyActive(mode: Mode): boolean {
  return mode.enabled && mode.noticeVersion === PRIVACY_NOTICE_VERSION
}

export function effectiveIndicator(mode: Mode): Mode['indicator'] {
  return privacyActive(mode) ? mode.indicator : 'chip'
}

export function createPrivacyMode(deps: { dock?: DockLike }) {
  const protectedWins = new Set<WinLike>()
  let dockHidden = false

  function setProtection(win: WinLike, want: boolean): void {
    if (win.isDestroyed()) { protectedWins.delete(win); return }
    if (want === protectedWins.has(win)) return
    win.setContentProtection(want)
    if (want) protectedWins.add(win)
    else protectedWins.delete(win)
  }

  function setDock(hidden: boolean): void {
    if (!deps.dock || hidden === dockHidden) return
    dockHidden = hidden
    if (hidden) deps.dock.hide()
    else void Promise.resolve(deps.dock.show()).catch(() => undefined)
  }

  function applyPrivacyMode(win: WinLike, mode: Mode, live: boolean): void {
    const active = privacyActive(mode)
    setProtection(win, active && mode.hideFromCapture)
    setDock(active && mode.noDockIcon && live)
    if (!win.isDestroyed()) win.setTitle(active && mode.neutralTitle ? NEUTRAL_TITLE : OVERLAY_TITLE)
  }

  /** Stop, panic, before-quit and the crash path all land here. */
  function restore(win: WinLike): void {
    setProtection(win, false)
    setDock(false)
  }

  function restoreAll(): void {
    for (const win of [...protectedWins]) setProtection(win, false)
    setDock(false)
  }

  return { applyPrivacyMode, restore, restoreAll }
}
