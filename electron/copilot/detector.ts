// Contract stub (WP0): interface only. The owning work package implements it in this file.
import type { DetectedQuestion, TranscriptLine } from './types'

/** Owner: WP2. Interviewer-channel finals only: rules, then an optional tiny classify call. */
export interface QuestionDetector {
  feed(line: TranscriptLine): Promise<DetectedQuestion | null>
  reset(): void
}
