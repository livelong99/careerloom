// Shared IPC contract types for feature modules — types only, no runtime.
// Imported by electron/* directly and re-exported by renderer/lib/types.ts.

// ————— Feature contracts (electron/{resume,metrics,integrations,tracker-actions}.ts) —————
// Each feature module exports `<name>Handlers`; main.ts registers them as `careerloom:<method>`.

export type DateRange = { from: string; to: string } // YYYY-MM-DD, inclusive
export type RunUsage = { costUsd: number | null; inputTokens: number; outputTokens: number; turns: number | null; durationMs: number | null }

// Resume
export type ResumeSection = { title: string; lines: number; text: string }
export type ResumeSource = { file: string; kind: string; size: number; updatedAt: number } // documents/**
export type CvTemplate = { name: string; displayName: string; file: string; builtin: boolean }
export type AtsIssue = { severity: string; message: string }
export type AtsResult = {
  file: string; pass: boolean; minScore: number; score: number; grade: string
  issues: AtsIssue[]
  keywordCoverage: { total: number; found: number; percent: number; missing: string[] } | null
  checkedAt: number
}
export type ExportFormat = 'pdf' | 'html' | 'tex' | 'docx' | 'md'
export type ResumeExport = { file: string; format: ExportFormat; updatedAt: number } // output/**
export type ResumeOverview = {
  cv: { updatedAt: number; words: number; sections: ResumeSection[] } | null
  sources: ResumeSource[]
  templates: CvTemplate[]
  activeTemplate: string | null
  lastAts: AtsResult | null
  exports: ResumeExport[]
}

// Monitoring
export type MetricBucket = { id: string; runs: number; failed: number; costUsd: number; tokens: number; durationMs: number }
export type MetricDay = { date: string; runs: number; costUsd: number; tokens: number; byRunner: Record<string, number> }
export type FindingSeverity = 'high' | 'medium' | 'low'
export type Finding = {
  id: string
  severity: FindingSeverity
  title: string
  detail: string
  /** A one-click fix: a career-ops mode to run, or a screen to open. */
  action: { kind: 'mode'; mode: string; input?: string; label: string } | { kind: 'navigate'; section: string; label: string } | null
}
export type Metrics = {
  range: DateRange | null
  totals: { runs: number; failed: number; cancelled: number; costUsd: number; tokens: number; avgDurationMs: number; successRate: number }
  byRunner: MetricBucket[]
  byMode: MetricBucket[]
  daily: MetricDay[]
  /** Run start times (ms) for the weekday × hour punchcard. */
  starts: number[]
  /** career-ops' own analytics (stats.mjs / funnel-velocity.mjs JSON), passed through loosely. */
  funnel: unknown
  velocity: unknown
  findings: Finding[]
}

// Integrations
export type IntegrationKind = 'skill' | 'source' | 'service' | 'plugin'
export type IntegrationStatus = 'ready' | 'needs_setup' | 'not_installed' | 'error' | 'off'
export type IntegrationAction = 'install' | 'remove' | 'enable' | 'disable' | 'start' | 'stop' | 'check' | 'update' | 'configure'
export type Integration = {
  id: string
  kind: IntegrationKind
  name: string
  summary: string
  status: IntegrationStatus
  statusText: string
  /** 'app' = bundled/adopted (read-only manage actions); 'user' = the user added it. */
  installedBy: 'app' | 'user'
  source: string | null
  actions: IntegrationAction[]
}
export type HealthCheck = { label: string; ok: boolean; detail?: string; optional?: boolean }
/** `options` renders a text field as a picker of those values. */
export type ConfigField = { key: string; label: string; type: 'text' | 'url' | 'path' | 'secret' | 'boolean'; value: string | boolean | null; help?: string; options?: readonly string[] }
export type IntegrationDetail = Integration & { checks: HealthCheck[]; config: ConfigField[]; logTail: string[]; path: string | null }
export type InstallPreview = {
  kind: IntegrationKind
  name: string
  /** What will happen, e.g. "Add Stripe (Greenhouse) to portals.yml". */
  plan: string
  warnings: string[]
  /** Set when the URL can't be installed; the UI shows it and offers no confirm. */
  refusal: string | null
}

// Pipeline
export type CanonicalStatus = 'Evaluated' | 'Applied' | 'Responded' | 'Interview' | 'Offer' | 'Hired' | 'Rejected' | 'Discarded' | 'SKIP'

// ————— CLI readiness (electron/readiness.ts) —————
export type CliCheck = {
  id: 'claude' | 'codex' | 'antigravity' | 'opencode'
  label: string
  path: string | null
  version: string | null
  signedIn: boolean | null
  skill: boolean
  configured: boolean
  ready: boolean
  problems: string[]
}
export type Readiness = { root: string; checkedAt: number; deps: boolean; clis: CliCheck[] }

// ————— Resume v2 (electron/resume.ts) —————
/** Structured profile the extraction agent writes to data/careerloom-profile.json. */
export type ProfileLink = { kind: 'linkedin' | 'github' | 'portfolio' | 'other'; url: string }
export type ExperienceItem = { company: string; title: string; location?: string; start?: string; end?: string; highlights: string[] }
export type EducationItem = { school: string; degree?: string; start?: string; end?: string }
export type ProjectItem = { name: string; url?: string; summary?: string }
export type ExtractedProfile = {
  name: string
  headline?: string
  email?: string
  phone?: string
  location?: string
  summary?: string
  links: ProfileLink[]
  skills: string[]
  experience: ExperienceItem[]
  education: EducationItem[]
  projects: ProjectItem[]
  /** Sections the original extraction shape had no room for; the template renders them when present. */
  awards?: string[]
  certifications?: string[]
  skillGroups?: Array<{ category: string; items: string[] }>
  extractedFrom?: string
  extractedAt?: number
}
export type ResearchSource = { url: string; file: string | null; fetchedAt: number; ok: boolean; error?: string }
export type ProfileResearch = { summary: string | null; sources: ResearchSource[]; updatedAt: number | null }
export type CvDocument = { markdown: string; updatedAt: number }

// ————— Jobs (electron/jobs.ts) —————
export type JobState = 'new' | 'queued' | 'evaluated' | 'applied' | 'interview' | 'offer' | 'closed'
export type JobListing = {
  /** Normalized posting URL — the join key across scan-history, pipeline.md and the tracker. */
  id: string
  url: string
  title: string
  company: string
  /** Portal = the company board in portals.yml (null for pasted links). */
  portalId: string | null
  ats: string | null
  location: string | null
  postedAt: string | null
  firstSeen: string | null
  trustScore: number | null
  trustFlags: string[]
  state: JobState
  status: string | null // tracker status text when evaluated
  score: number | null
  reportNum: number | null
  reportPath: string | null
  evaluatedAt: string | null
  /** Evaluated before the résumé last changed → worth re-running. */
  stale: boolean
}
export type Portal = {
  id: string // slug-ish stable id derived from the portals.yml entry
  name: string
  ats: string | null
  careersUrl: string | null
  enabled: boolean
  jobCount: number
  newCount: number
  lastSeen: string | null
  guideline: string | null
  /** Starter-pack group (portals.yml `category:`): Common, Tech, Finance or Consulting; null when unset. */
  category?: string | null
  /** Web board (any listing page, portals.yml `fetch:`), null for provider portals. */
  fetch?: 'firecrawl' | 'browser' | null
  /** Rail grouping: a tracked company, a job_boards aggregator, or a Careerloom web/browser board. */
  kind?: 'company' | 'board' | 'web'
  /** Latest data/portal-health.tsv status (e.g. reachable) and when it was checked. */
  health?: string | null
  checkedAt?: string | null
}
/** One board's editable fields (Boards → editor sheet). */
export type PortalDetail = { id: string; list: 'tracked_companies' | 'job_boards'; name: string; urls: string[]; enabled: boolean; fetch: 'firecrawl' | 'browser' | null; provider: string | null; api: string | null; guideline: string | null }
export type PortalPatch = { name?: string; urls?: string[]; enabled?: boolean; fetch?: 'firecrawl' | 'browser'; provider?: string | null; api?: string | null }
/** A scan in the Boards → Scans history (Careerloom run and/or a scan-runs.tsv row). */
export type ScanHistoryRow = {
  id: string; runId: string | null; source: 'careerloom' | 'career-ops'; label: string; boards: string | null
  startedAt: number; durationMs: number | null; status: 'done' | 'failed' | 'cancelled' | 'running'
  found: number | null; added: number | null; dupes: number | null
  /** Boards that errored inside a scan that otherwise finished (scan-runs.tsv `errors`). */
  errors: number | null
}
/** Browser boards' effective login source (what a scan will use), for the consent dialog's picker. */
export type BrowserLoginStatus = { source: 'off' | 'chrome' | 'file'; sourceSet: boolean; profile: string; profiles: string[]; cookiesFile: string; label: string; pageWait: number }
/** Web board "Preview extraction": first page scraped, JSON-LD only (no agent). `provider` = a
 *  URL career-ops already supports (added as a regular portal instead). */
export type WebBoardJob = { title: string; company: string; url: string; location: string; posted_at: string | null; salary: string | null; employment_type: string | null; remote: boolean | null; description_snippet: string }
export type WebBoardPreview = { provider: string | null; count: number; sample: WebBoardJob[]; method: 'json-ld' | 'agent' | 'provider'; nextPage: string | null; chars: number }

// ————— Agent chat (electron/chat.ts) —————
export type ChatRole = 'user' | 'agent'
export type ChatMessage = { id: string; role: ChatRole; text: string; at: number; runId?: string; status?: 'running' | 'done' | 'failed' | 'cancelled' }
export type ChatThreadSummary = { id: string; title: string; createdAt: number; updatedAt: number; runner: string; status: 'idle' | 'running' | 'failed'; preview: string }
export type ChatThread = ChatThreadSummary & { sessionId: string | null; messages: ChatMessage[] }

// ————— Onboarding (electron/onboarding.ts) —————
export type ToolCheck = { path: string | null; version: string | null; ok: boolean }
export type DirState = 'missing' | 'empty' | 'valid' | 'occupied'
export type Prerequisites = { node: ToolCheck; npm: ToolCheck; git: ToolCheck; platform: string; defaultCareerOpsDir: string; defaultDirState: DirState }

// ————— Pre-screen (electron/prescreen.ts): rule gates, then a public-data base model + gated personal layer on local verdict-small embeddings —————
export type PrescreenMethod = 'model' | 'rules'
export type PrescreenBucket = 'likely' | 'uncertain' | 'unlikely'
/** Which step decided the bucket: a rule gate, the trained model, the user's own label, or nothing (no signal). */
export type PrescreenGate = 'location' | 'function' | 'seniority' | 'model' | 'feedback' | 'keywords'
export type PrescreenSignals = { otherFunction: string | null; targetRole: string | null }
/** `fit` = the trained head's P(relevant) for the title (null without a model); `reason` = the human "why". */
export type PrescreenEntry = { bucket: PrescreenBucket; fit: number | null; reason: string; gate: PrescreenGate; signals: PrescreenSignals; at: string; profileHash: string; method: PrescreenMethod; stale?: boolean }
/** Allowed countries (canonical names), whether remote-anywhere / region-wide postings pass, and years of experience (null = skip the seniority gate). */
export type PrescreenPolicy = { countries: string[]; remoteAnywhere: boolean; years: number | null }
/** The personal layer's last fit: `personal` = it passed the gate and is in use; `gain` = its CV accuracy
 *  gain over the base model (0.03 = +3 pts); `groups` = the profile's target occupations ("ISCO 251 …"). */
export type PrescreenModel = { personal: boolean; gain: number; groups: string[]; n: number; pos: number; neg: number; trainedAt: string }
export type PrescreenStatus = {
  /** A local encoder runtime (venv + weights) was found. */
  available: boolean
  /** The encoder model id (e.g. 'Manav2op/verdict-small'), null without one. */
  backend: string | null
  reason: string | null
  model: PrescreenModel | null
  /** Target occupations the base model picked for the profile at the last run ("ISCO 251 …"). */
  groups: string[]
  /** Real labels (your marks + tracker outcomes) by class — the personal layer needs 5 of each. */
  labels: { pos: number; neg: number }
  policy: PrescreenPolicy
  /** Profile-derived defaults, for "reset". */
  defaults: PrescreenPolicy
  feedback: Record<string, boolean>
}
export type PrescreenRun = { results: Record<string, PrescreenEntry>; method: PrescreenMethod; model: PrescreenModel | null; note: string | null; counts: Record<PrescreenBucket, number>; dropped: Partial<Record<PrescreenGate, number>> }
/** The optional local model install (electron/prescreen-model.ts). `python` null = none ≥ 3.10 found (`oldPython` = an older one that was). */
export type LocalModelStatus = {
  installed: boolean
  model: string
  dir: string
  platform: string
  arch: string
  python: { bin: string; version: string } | null
  oldPython: string | null
  downloadGb: { packages: number; weights: number }
  /** Id of an install run still in progress. */
  installRun: string | null
}

// ————— ATS / Resume (electron/ats/*, electron/resume.ts) —————
export type ScoreBlockPart = { id: string; label: string; got: number; max: number; evidence?: string }
export type ScoreCap = { id: string; max: number; reason: string }
/** A score the code computed: `score` sits in [low, high]; `caps` are the hard ceilings that applied. */
export type ScoreBlock = { score: number; low: number; high: number; confidence: 'low' | 'medium' | 'high'; parts: ScoreBlockPart[]; caps: ScoreCap[] }
export type AtsSeverity = 'critical' | 'major' | 'minor' | 'info'
export type AtsCategory = 'parse' | 'keyword' | 'evidence' | 'bullet' | 'date' | 'section' | 'seniority' | 'skill'
export type ApplyOp = {
  /** 'rebuild-profile' regenerates the template data from cv.md (no cv.md edit, no agent). */
  op: 'replace' | 'insert' | 'append' | 'delete' | 'rebuild-profile'
  /** Exact cv.md text to change (replace/delete) or the heading/line to anchor on (insert/append). */
  target: string
  before?: string
  after: string
  /** ids of AtsQuestions the user must answer before this can be applied. */
  requires_answers: string[]
}
export type AtsFinding = {
  id: string
  severity: AtsSeverity
  category: AtsCategory
  title: string
  detail: string
  evidence?: string
  apply?: ApplyOp
  status: 'open' | 'applied' | 'dismissed'
}
export type SkillGap = { skill: string; canonical: string; required: boolean; bucket: 'gap' | 'supported' | 'existing'; lowConfidence?: boolean; howToAdd: string }
export type Course = { title: string; provider: string; url: string; verified_at: number; free: boolean; hours?: number; skill: string; why: string }
export type AtsQuestion = { id: string; finding_id?: string; text: string; type: 'text' | 'choice' | 'number'; options?: string[]; why: string }
export type AtsAnswer = { id: string; value: string | number }
export type AtsReport = {
  id: string
  createdAt: number
  hashes: { cv: string; jd?: string; tpl: string }
  label: 'parse-risk heuristic'
  parse: ScoreBlock
  match?: ScoreBlock
  /** What was unavailable: semantic similarity (no local model) or the real PDF text layer. */
  degraded: { embeddings: boolean; pdfText: boolean }
  findings: AtsFinding[]
  skillGaps: SkillGap[]
  courses: Course[]
  plan?: string
  /** Plain-language limits of this run (no web-search runner, local model missing, …). */
  notes?: string[]
  session?: { runId: string; sessionId: string | null; round: number; questions: AtsQuestion[] }
}
export type AtsApplyResult = { ok: boolean; error?: string; undoId?: string; newCv?: string; rescore?: AtsReport }
export type AtsPreview = { diff: { before: string; after: string }; factCheck: { ok: boolean; violations: string[] } }
export type AtsPhase = 'parse' | 'extract' | 'agent' | 'score' | 'done'
export type AtsEvent = { runId: string; phase: AtsPhase; message: string; questions?: AtsQuestion[] }
export type AtsAnalyzeInput = { jd?: string; jobId?: string; templateId?: string }
