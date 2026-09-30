// Private main → overlay channel (`careerloom:copilotOverlayCmd`). Not part of the frozen contract: only the
// overlay window receives it, and it carries presentation commands, never session data.
import type { Anchor } from './types'

export const OVERLAY_CMD_CHANNEL = 'careerloom:copilotOverlayCmd'
export type OverlayCmdEvent = { wipe?: boolean; layout?: 'strip' | 'panel'; anchor?: Anchor }
