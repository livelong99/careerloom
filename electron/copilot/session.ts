// Contract stub (WP0): interface only. The owning work package implements it in this file.
import type { CopilotState, StartRequest, StopReason } from './types'

/** Owner: WP3 (capture + STT orchestration); WP2/WP4 attach engine and store. State machine idle → armed → listening → stopped. */
export interface SessionController {
  start(req: StartRequest): Promise<{ sessionId: string }>
  stop(reason: StopReason): Promise<void>
  state(): CopilotState
}
