// Contract stub (WP0): interface only. The owning work package implements it in this file.
import type { CopilotApi } from './types'

export type OverlayCommand = Parameters<CopilotApi['copilotOverlay']>[0]
/** Owner: WP1. Creates/positions the overlay BrowserWindow(s); never takes focus. */
export interface OverlayController {
  open(): void
  close(): void
  apply(cmd: OverlayCommand): void
  isVisible(): boolean
}
