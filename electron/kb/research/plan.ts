// WP2 owns this file. Queries from the structured posting + gaps + skills; the privacy filter (plan §3.2 step 2, §9).
import { todo } from '../todo'
import type { ResearchPlan, SkillNode } from '../types'

export type PlanInput = { jobId: string; title: string; company: string; skills: SkillNode[]; techStack: string[]; gaps: string[]; cv: string }
export const buildPlan = (_input: PlanInput): ResearchPlan => todo('WP2')
/** True when the query is safe to send out (no emails, phones, name or ≥ 6-word spans of the cv). */
export const privacyFilter = (_query: string, _cv: string): boolean => todo('WP2')
