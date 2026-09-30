// Contract stub (WP0): interface only. The owning work package implements it in this file.
import type { CopilotConfig } from './types'

export type HotkeyResult = { action: keyof CopilotConfig['hotkeys']; accelerator: string; registered: boolean; reason?: 'in-use' | 'reserved' | 'invalid' }
/** Owner: WP1. Wraps globalShortcut; a failed register is reported, never swallowed. */
export interface HotkeyService {
  registerAll(hotkeys: CopilotConfig['hotkeys'], handler: (action: keyof CopilotConfig['hotkeys']) => void): HotkeyResult[]
  unregisterAll(): void
  check(accelerator: string): { ok: boolean; reason?: 'in-use' | 'reserved' | 'invalid' }
}
