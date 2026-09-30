// Contract stub (WP0): interface only. The owning work package implements it in this file.
import type { PracticeQuestion, QuestionType } from './types'

/** Owner: WP4. Mock-interviewer queue built from the report's interview plan. */
export interface PracticeRunner {
  questions(jobId: string): PracticeQuestion[]
  followUp(questionId: string, answer: string): Promise<{ text: string; type: QuestionType } | null>
}
