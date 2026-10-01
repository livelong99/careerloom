// WP4 owns this file. System prompt builder (style, seniority, strictness, mode).
import type { KbItem } from '../kb/types'
import { todo } from '../kb/todo'
import type { InterviewPlan } from './types'

export const buildPersona = (_plan: InterviewPlan, _item: KbItem | null): string => todo('WP4')
