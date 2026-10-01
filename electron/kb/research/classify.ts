// WP2 owns this file. Type/skill/difficulty: rules first, helper LLM for the rest.
import { todo } from '../todo'
import type { Difficulty, KbQuestionType, SkillNode } from '../types'

export type Classified = { type: KbQuestionType; skills: string[]; difficulty: Difficulty }
export const classify = (_text: string, _skills: SkillNode[], _call?: (system: string, user: string) => Promise<string>): Promise<Classified> => todo('WP2')
