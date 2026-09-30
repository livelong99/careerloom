import type { AtsAnswer, AtsEvent, AtsHistoryItem, AtsPhase, AtsQuestion, AtsReport, CvDocument, ExtractedProfile, ProfileResearch, ResumeOverview, Run } from '../../lib/types'

export type PageId = 'overview' | 'content' | 'templates' | 'ats' | 'skillup' | 'research'

/** What the analysis run is doing right now, fed by the `atsEvents` push channel. */
export type AtsLive = { running: boolean; phase: AtsPhase | 'idle'; message: string; error: string | null; events: AtsEvent[]; questions: AtsQuestion[] }
export const IDLE: AtsLive = { running: false, phase: 'idle', message: '', error: null, events: [], questions: [] }

/** What the Resume shell loads once and hands to every page. */
export type ResumeCtx = {
  overview: ResumeOverview
  cv: CvDocument | null
  profile: ExtractedProfile | null
  research: ProfileResearch | null
  report: AtsReport | null
  history: AtsHistoryItem[]
  live: AtsLive
  go: (page: PageId) => void
  refresh: () => void
  adopt: (run: Run) => void
  analyze: (jd: string, templateId?: string) => Promise<void>
  answer: (runId: string, answers: AtsAnswer[]) => Promise<void>
}
