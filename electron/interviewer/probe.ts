// WP4 owns this file. Follow-up checklist (LLM returns booleans, code decides), ≤ 2 probes per question (plan §6.3).
import { todo } from '../kb/todo'
import type { InterviewPlan } from './types'

export type ProbeDecision = { probe: boolean; weakest: string | null }
export const decideProbe = (_answer: string, _plan: InterviewPlan, _probesSoFar: number, _call: (system: string, user: string) => Promise<string>): Promise<ProbeDecision> => todo('WP4')
