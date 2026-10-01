// Practice form state for the AI interviewer (plan §8): shared by the Practice page and the header's Start practice.
import { useSyncExternalStore } from 'react'

import type { InterviewMode, InterviewPlan, VoiceInfo } from '@/lib/types'

export type InterviewForm = {
  /** The job the AI interviewer was enabled for: a different job falls back to the report questions. */
  enabledFor: string | null
  mode: InterviewMode; minutes: number | null; focusSkills: string[]; difficulty: InterviewPlan['difficulty']; includeGenerated: boolean
  style: string; seniority: string; strictness: 1 | 2 | 3 | 4 | 5; name: string
  voiceId: string | null; speed: number; echo: InterviewPlan['echo']
  /** Set by 'Practise this question' in the knowledge base: pins the session to these items. */
  itemIds: string[] | null
}

export const MODES: ReadonlyArray<{ value: InterviewMode; label: string; blurb: string }> = [
  { value: 'recruiter', label: 'Recruiter screen', blurb: 'Motivation, logistics, salary. About 10 min.' },
  { value: 'mixed', label: 'Mixed loop', blurb: 'Behavioural, technical and one design question.' },
  { value: 'behavioural', label: 'Behavioural', blurb: 'STAR stories, up to two probes each.' },
  { value: 'technical', label: 'Technical depth', blurb: 'One skill at a time, hints are scored.' },
  { value: 'system-design', label: 'System design', blurb: 'Requirements to trade-offs.' },
  { value: 'coding', label: 'Coding', blurb: 'Talk through it or type your answer.' },
]
export const STYLES = ['Structured and fair', 'Friendly and conversational', 'Fast-paced startup', 'Rigorous and probing'] as const
export const SENIORITIES = ['Recruiter', 'Engineering manager', 'Senior engineer', 'Director'] as const
export const MINUTES: ReadonlyArray<{ value: string; label: string }> = [{ value: '15', label: '15 min' }, { value: '30', label: '30 min' }, { value: '45', label: '45 min' }, { value: 'none', label: 'No limit' }]

const INITIAL: InterviewForm = {
  enabledFor: null, mode: 'mixed', minutes: 30, focusSkills: [], difficulty: 'adaptive', includeGenerated: true,
  style: STYLES[0], seniority: SENIORITIES[1], strictness: 3, name: 'Priya', voiceId: null, speed: 1, echo: 'speakers', itemIds: null,
}
let form: InterviewForm = INITIAL
const listeners = new Set<() => void>()
export const getInterviewForm = (): InterviewForm => form
export function setInterviewForm(patch: Partial<InterviewForm>): void { form = { ...form, ...patch }; listeners.forEach(l => l()) }
export const resetInterviewForm = (): void => { form = INITIAL; listeners.forEach(l => l()) }
export const useInterviewForm = (): InterviewForm => useSyncExternalStore(cb => { listeners.add(cb); return () => { listeners.delete(cb) } }, getInterviewForm)

/** The voice a plan uses: the chosen one when still installed, else the first installed (Indian-English system voices come first from main), else 'default'. */
export function pickVoice(f: InterviewForm, voices: VoiceInfo[]): { engine: InterviewPlan['voice']['engine']; voiceId: string } {
  const v = voices.find(x => x.id === f.voiceId && x.installed) ?? voices.find(x => x.installed)
  return v ? { engine: v.engine, voiceId: v.id } : { engine: 'system', voiceId: 'default' }
}

export const toPlan = (f: InterviewForm, voices: VoiceInfo[]): InterviewPlan => ({
  mode: f.mode, minutes: f.minutes, focusSkills: f.focusSkills, difficulty: f.difficulty, includeGenerated: f.includeGenerated,
  persona: { style: f.style, seniority: f.seniority, strictness: f.strictness, name: f.name },
  voice: { ...pickVoice(f, voices), speed: f.speed }, echo: f.echo,
  ...(f.itemIds?.length ? { itemIds: f.itemIds } : {}),
})
