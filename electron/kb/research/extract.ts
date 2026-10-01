// WP2 owns this file. Page text → candidate items (schema-validated JSON, evidence spans).
import { todo } from '../todo'
import type { KbQuestionType } from '../types'

export type Candidate = { text: string; type?: KbQuestionType; skills?: string[]; evidence: string; note: string }
export const extractCandidates = (_pageText: string, _call: (system: string, user: string) => Promise<string>): Promise<Candidate[]> => todo('WP2')
