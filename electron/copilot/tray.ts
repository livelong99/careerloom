// Contract stub (WP0): interface only. The owning work package implements it in this file.
import type { CopilotState } from './types'

/** Owner: WP1. The menu-bar icon always reflects capture state and carries "Stop now". */
export interface TrayController {
  setState(state: CopilotState): void
  onStopNow(cb: () => void): void
  destroy(): void
}
