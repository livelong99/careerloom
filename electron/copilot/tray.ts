// The menu-bar icon always reflects capture state and always carries "Stop now" (plan §3.5, §9).
// It is driven only by `CopilotState`: the overlay indicator setting (chip / dot / off) has no input here.
import type { CopilotState } from './types'

type MenuItem = { label?: string; enabled?: boolean; type?: 'separator'; click?: () => void }
type TrayLike = { setImage(image: unknown): void; setToolTip(text: string): void; setContextMenu(menu: unknown): void; destroy(): void }
/** Electron pieces injected so the logic tests without Electron. */
export type TrayDeps = {
  createTray(image: unknown): TrayLike
  icon(kind: 'idle' | 'live'): unknown
  menu(items: MenuItem[]): unknown
}

export interface TrayController {
  setState(state: CopilotState): void
  onStopNow(cb: () => void): void
  destroy(): void
}

export function createTrayController(deps: TrayDeps): TrayController {
  let stopNow: () => void = () => undefined
  let tray: TrayLike | null = null
  let state: CopilotState = 'idle'

  function render(): void {
    const listening = state === 'listening'
    tray ??= deps.createTray(deps.icon('idle'))
    tray.setImage(deps.icon(listening ? 'live' : 'idle'))
    tray.setToolTip(`Careerloom Copilot: ${listening ? 'listening' : 'not listening'}`)
    tray.setContextMenu(deps.menu([
      { label: listening ? 'Listening' : 'Not listening', enabled: false },
      { type: 'separator' },
      { label: 'Stop now', enabled: listening || state === 'armed', click: () => stopNow() },
    ]))
  }

  render() // the icon is there from the start, idle

  return {
    setState(next) { state = next; render() },
    onStopNow(cb) { stopNow = cb },
    destroy() { tray?.destroy(); tray = null },
  }
}
