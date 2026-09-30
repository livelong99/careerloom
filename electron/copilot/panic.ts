// Contract stub (WP0): interface only. The owning work package implements it in this file.
import type { StopReason } from './types'

/** Owner: WP1. Capture off first, then abort requests, hide overlay, notify renderers. Idempotent. */
export interface PanicController {
  trigger(reason: StopReason): Promise<void>
  /** Registers the before-quit / render-process-gone / heartbeat-loss triggers. */
  arm(): void
}
