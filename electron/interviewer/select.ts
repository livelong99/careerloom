// WP4 owns this file. Next-question scoring (plan §6.2); deterministic from the session seed.
import type { KbItem } from '../kb/types'
import { todo } from '../kb/todo'
import type { InterviewPlan, InterviewerState } from './types'

export const selectNext = (_pool: KbItem[], _plan: InterviewPlan, _state: InterviewerState): KbItem | null => todo('WP4')
