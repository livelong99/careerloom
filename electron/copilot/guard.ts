// Contract stub (WP0): interface only. The owning work package implements it in this file.
import type { Suggestion } from './types'

/** Owner: WP2. After the stream ends: factCheck against cv.md, flag (never silently remove); proof[] must be substrings. */
export interface AnswerGuard {
  check(cv: string, suggestion: Suggestion): Suggestion
}
