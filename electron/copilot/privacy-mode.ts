// Contract stub (WP0): interface only. The owning work package implements it in this file.
import type { BrowserWindow } from 'electron'
import type { CopilotConfig } from './types'

/** Owner: WP1. The single file that owns every low-profile flag (plan §3.5). */
export interface PrivacyModeApplier {
  applyPrivacyMode(win: BrowserWindow, cfg: CopilotConfig['privacy']['mode'], live: boolean): void
  /** Restores Dock icon / content protection (stop, panic, before-quit, crash path). */
  restore(win: BrowserWindow): void
}
