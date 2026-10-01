// WP4 owns this file. Per-question rubric scoring and KbItem.stats write-back (plan §6.4).
import type { KbItem } from '../kb/types'
import { todo } from '../kb/todo'
import type { QuestionResult } from './types'

export const scoreAnswer = (_item: KbItem, _answer: string, _call: (system: string, user: string) => Promise<string>): Promise<QuestionResult> => todo('WP4')
