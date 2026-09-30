import type { AtsReport, CvDocument, ExtractedProfile, ProfileResearch, ResumeOverview, Run } from '../../lib/types'

/** What the Resume shell loads once and hands to every page. */
export type ResumeCtx = {
  overview: ResumeOverview
  cv: CvDocument | null
  profile: ExtractedProfile | null
  research: ProfileResearch | null
  report: AtsReport | null
  refresh: () => void
  adopt: (run: Run) => void
}
