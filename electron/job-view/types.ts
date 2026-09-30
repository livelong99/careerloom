// Shapes shared by the job-view parsers, IPC and the renderer (re-exported from contract.ts).
export type MatchStatus = 'match' | 'partial' | 'missing' | 'unknown'
export type ReportBlock =
  | { kind: 'md'; text: string }
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'table'; headers: string[]; rows: string[][] }
export type ReportSection = { id: string; letter: string | null; kind: string | null; title: string; blocks: ReportBlock[] }
export type ReportGap = { title: string; risk: string | null; mitigation: string | null }
export type ReportView = {
  company: string | null; role: string | null; score: number | null; legitimacy: string | null; date: string | null
  archetype: string | null; workAuth: string | null; url: string | null; batchId: string | null
  decision: string | null; hardStops: string[]; softGaps: string[]; topStrengths: string[]
  advertisedComp: string | null; riskLevel: string | null; nextAction: string | null; workAuthCheck: string | null
  jd: string | null
  cvMatch: Array<{ requirement: string; importance: string | null; status: MatchStatus; match: string; jdSignal: string | null; evidence: string | null }>
  gaps: ReportGap[]
  scores: Array<{ dimension: string; value: number; note: string | null }>
  personalization: Array<{ section: string; current: string; proposed: string; why: string }>
  keywords: string[]
  roleAttributes: Array<{ label: string; value: string }>
  risks: Array<{ label: string; value: string }>
  sections: ReportSection[]
  warnings: string[]
}

export type JobPosting = {
  title: string | null; company: string | null; location: string | null
  workMode: 'remote' | 'hybrid' | 'onsite' | null; employmentType: string | null; seniority: string | null
  salary: { min: number | null; max: number | null; currency: string | null; period: string | null; text: string | null } | null
  summary: string | null; responsibilities: string[]; requirements: { required: string[]; preferred: string[] }
  benefits: string[]; aboutCompany: string | null; techStack: string[]; deadline: string | null
}
export type JobViewMeta = { source: 'report' | 'prefetch' | 'none'; filled: 'deterministic' | 'model' | 'model-failed'; model: string | null; tokens: number | null; cachedAt: number }
export type JobView = { id: string; report: ReportView | null; posting: JobPosting | null; meta: JobViewMeta; rawJd: string | null; rawReport: string | null }
