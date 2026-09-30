import type { OverlayViewState, Suggestion } from '../../electron/contract'

export type OverlayLine = { id: string; who: 'Interviewer' | 'You'; text: string; partial: boolean }
export type OverlayProblem = { kind: 'stt' | 'system' | 'mic' | 'error'; title?: string; attempt?: number; message?: string }

/** Everything the overlay draws. The live overlay derives it from events; OverlayPreview passes samples. */
export type OverlayViewData = {
  state: OverlayViewState
  layout: 'strip' | 'panel'
  practice: boolean
  /** System audio is being captured (false reads "mic only"). */
  sys: boolean
  /** Only `chip` unless Privacy mode is on and acknowledged (decided in privacy-mode.ts, honoured here). */
  indicator: 'chip' | 'dot' | 'off'
  passive: boolean
  time: string
  latency: string
  cost: string
  question: { type: string; text: string } | null
  suggestion: Suggestion | null
  lines: OverlayLine[]
  levels: { mic: number; system: number }
  engine: string
  tier: string
  /** Minutes of transcript kept, for the stopped panel. */
  savedMinutes: number
  problem: OverlayProblem | null
  /** Accelerator labels shown on buttons (⌃⌥A). */
  keys: Record<'answer' | 'followup' | 'clarify' | 'screenshot' | 'summarise' | 'expand' | 'listen' | 'panic', string>
  /** Quick hide: the text is gone from the screen while the session keeps running. */
  wiped: boolean
}

/** Optional: a missing handler renders its button disabled (the backing call does not exist yet). */
export type OverlayActions = Partial<{
  answer(kind: 'answer' | 'followup' | 'clarify' | 'summarise'): void
  screenshot(): void
  collapse(): void
  expand(): void
  stop(): void
  start(): void
  fix(): void
  retry(): void
  micOnly(): void
  switchOnDevice(): void
  deleteTranscript(): void
  openDebrief(): void
}>
