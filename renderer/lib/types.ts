// ————— Careerloom bridge contract (electron/main.ts handlers ↔ renderer) —————

export type RunnerId = 'claude' | 'codex' | 'antigravity' | 'opencode' | 'zen' | 'api'

export type Application = {
  num: number
  date: string
  company: string
  via: string | null
  role: string
  score: number | null
  status: string
  pdf: boolean
  report: string | null
  notes: string
}
export type PipelineItem = { url: string; company: string | null; role: string | null; done: boolean; raw: string }
export type ReportMeta = { file: string; title: string; date: string | null; score: number | null; url: string | null }
export type RootCheck = { ok: true; root: string; dataRoot: string } | { ok: false; reason: string }

export type CliRunner = Exclude<RunnerId, 'api' | 'zen'>
/** Runners with a model setting. */
export type ModelRunner = Exclude<RunnerId, 'api'>
export type Settings = { root: string | null; runner: RunnerId; models: Partial<Record<ModelRunner, string>>; helperModels: Partial<Record<ModelRunner, string>>; hasApiKey: boolean; hasOpencodeKey: boolean; rootCheck: RootCheck | null; prefs: Prefs; llm: LlmSettings; keyMeta: Partial<Record<KeyId, KeyTest>> }
export type ModelOption = { id: string; label: string }
export type RunnerStatus = Record<'claude' | 'codex' | 'antigravity' | 'opencode' | 'node' | 'git', string | null>
export type ProfileStatus = { cv: boolean; profile: boolean; portals: boolean }

export type ModeInput = 'url' | 'report' | 'text' | null
export type ModeInfo = { label: string; input: ModeInput; apiCommand: string | null }
export type Modes = Record<string, ModeInfo>

export type RunStatus = 'running' | 'done' | 'failed' | 'cancelled'
export type Run = {
  id: string
  runner: RunnerId | 'setup'
  mode: string
  label: string
  input: string | null
  startedAt: number
  endedAt: number | null
  status: RunStatus
  usage?: RunUsage | null
  sessionId?: string | null
  /** The job this run was about, when it was started for one (evaluate, tailored CV, cover letter, ATS, posting structuring). */
  jobId?: string | null
}
export type RunEvent = { id: string; kind: 'chunk'; text: string } | { id: string; kind: 'exit'; status: RunStatus }

export type CareerloomBridge = {
  getSettings(): Promise<Settings>
  setRoot(root: string): Promise<RootCheck>
  setRunner(runner: RunnerId): Promise<unknown>
  /** `provider`: any LLM provider id or 'opencode' (default OpenRouter). */
  setApiKey(key: string | null, provider?: ProviderId | 'opencode'): Promise<boolean>
  /** Model for one CLI runner; null = that CLI's default. */
  setModel(runner: ModelRunner, model: string | null): Promise<unknown>
  listModels(runner: ModelRunner): Promise<ModelOption[]>
  chooseDirectory(): Promise<string | null>
  runnerStatus(): Promise<RunnerStatus>
  modes(): Promise<Modes>
  profileStatus(): Promise<ProfileStatus>
  getTracker(): Promise<Application[]>
  getPipeline(): Promise<PipelineItem[]>
  listReports(): Promise<ReportMeta[]>
  readReport(rel: string): Promise<string>
  listRuns(): Promise<Run[]>
  /** Run log with credential-looking lines hidden. */
  getRunLog(id: string): Promise<string>
  /** Forget finished runs (history + saved log); running ones are skipped. Resolves with how many were removed. */
  deleteRuns(ids: string[]): Promise<number>
  startRun(req: { mode: string; input?: string; /** Agent Skill ids for this run only; omit for every enabled skill. */ skills?: string[] }): Promise<Run>
  /** Evaluate a link/JD; prefetches the page through Firecrawl when it is running. */
  evaluateJob(input: string): Promise<Run>
  cancelRun(id: string): Promise<boolean>
  setupCareerOps(parent: string): Promise<Run>
  /** First-run: Node/npm/git probes + the default career-ops folder state. */
  prerequisites(): Promise<Prerequisites>
  /** Clone career-ops into ~/Documents/career-ops (or adopt it if already valid). */
  installCareerOpsDefault(): Promise<{ run: Run | null; root: string }>
  onRun(cb: (event: RunEvent) => void): () => void
  onSettings(cb: () => void): () => void
  /** First-launch dependency installer (electron/runtime/bootstrap.ts). */
  bootstrapStatus(): Promise<BootstrapStatus>
  bootstrapStart(arg?: { retry?: BootstrapStepId }): Promise<BootstrapStatus>
  onBootstrap(cb: (status: BootstrapStatus) => void): () => void
  /** Per-CLI readiness for the chosen folder (install, sign-in, skill, headless setup). */
  getReadiness(force?: boolean): Promise<Readiness | null>
  onReadiness(cb: (event: { readiness: Readiness; switchedTo: string | null }) => void): () => void
  // Resume
  resumeOverview(): Promise<ResumeOverview>
  importResume(): Promise<ResumeSource | null>
  parseResume(): Promise<Run>
  setTemplate(name: string): Promise<boolean>
  importTemplate(): Promise<CvTemplate | null>
  createTemplate(description: string): Promise<Run>
  previewTemplate(name: string): Promise<string>
  exportResume(format: ExportFormat): Promise<Run>
  revealExport(file: string): Promise<boolean>
  readCv(): Promise<CvDocument | null>
  writeCv(markdown: string): Promise<CvDocument>
  /** Agent extracts documents/cv/<file> into cv.md + data/careerloom-profile.json. */
  extractResume(file: string): Promise<Run>
  readProfile(): Promise<ExtractedProfile | null>
  /** Firecrawl-fetches the profile's links, then the agent writes a research summary. */
  researchProfile(): Promise<Run>
  readResearch(): Promise<ProfileResearch>
  // ————— ATS / Resume —————
  atsAnalyze(input: AtsAnalyzeInput): Promise<{ runId: string }>
  /** With `jobId`: that job's own analysis (separate from the résumé-level one). */
  atsGet(jobId?: string): Promise<AtsReport | null>
  atsAnswer(runId: string, answers: AtsAnswer[], jobId?: string): Promise<{ runId: string }>
  atsPreviewApply(findingId: string, answers?: AtsAnswer[]): Promise<AtsPreview>
  atsApply(findingId: string, answers?: AtsAnswer[]): Promise<AtsApplyResult>
  atsUndo(undoId: string): Promise<AtsApplyResult>
  atsDismiss(findingId: string): Promise<boolean>
  /** Applied changes that can still be undone, newest first. */
  atsHistory(): Promise<AtsHistoryItem[]>
  onAtsEvent(cb: (event: AtsEvent) => void): () => void
  // ————— Job page —————
  /** Everything the job page shows, from cache when it can; `pending` = structuring still running (an `onJobView` event follows). */
  jobView(id: string): Promise<JobView & { pending: boolean }>
  onJobView(cb: (e: { id: string }) => void): () => void
  setHelperModel(runner: ModelRunner, model: string | null): Promise<unknown>
  docsList(jobId: string): Promise<Artifact[]>
  /** Starts in the background; progress and the result arrive through `onDocs`. */
  docsGenerate(jobId: string, kind: DocKind, options?: DocsOptions): Promise<{ started: true }>
  docsReadText(rel: string): Promise<string>
  docsReadPdf(rel: string): Promise<Uint8Array>
  docsReveal(rel: string): Promise<boolean>
  docsSave(rel: string): Promise<string | null>
  onDocs(cb: (e: DocsEvent) => void): () => void
  /** The template filled with the current résumé, as PDF bytes (for the in-app viewer). */
  renderTemplatePdf(name: string): Promise<Uint8Array>
  /** Save dialog → writes that PDF; resolves to the saved path or null if cancelled. */
  savePdf(name: string): Promise<string | null>
  // Jobs
  listJobs(): Promise<JobListing[]>
  listPortals(): Promise<Portal[]>
  scanPortals(ids: string[]): Promise<Run>
  /** Unevaluated (new/queued) jobs per portal id. */
  countUnevaluated(ids: string[]): Promise<Record<string, number>>
  /** Remove portals (+ guideline, web index); evaluated jobs stay; optionally hide their unevaluated jobs. */
  deletePortals(ids: string[], hideUnevaluated: boolean): Promise<{ removed: number; hidden: number }>
  /** Merge career-ops' default portals + browser presets (disabled); returns how many were added. */
  addDefaultPortals(): Promise<number>
  switchToStarterPack(): Promise<{ removed: number; hidden: number; added: number }>
  getPortal(id: string): Promise<PortalDetail>
  /** Validated in main (names, SSRF-checked URLs, provider id); a rename carries the guideline along. */
  updatePortal(id: string, patch: PortalPatch): Promise<PortalDetail>
  setPortalsEnabled(ids: string[], enabled: boolean): Promise<number>
  listScans(): Promise<ScanHistoryRow[]>
  /** SSRF-guard check for a board URL; the error message, or null when fine. */
  checkBoardUrl(url: string): Promise<string | null>
  browserLoginStatus(): Promise<BrowserLoginStatus>
  /** Pre-screen policy, local model runtime + trained head, and the user's relevance labels. */
  prescreenStatus(): Promise<PrescreenStatus>
  /** Screen jobs (empty = every unevaluated job) before spending agent tokens on them. */
  prescreenJobs(ids?: string[]): Promise<PrescreenRun>
  readPrescreen(): Promise<Record<string, PrescreenEntry & { stale: boolean }>>
  savePrescreenPolicy(policy: PrescreenPolicy): Promise<PrescreenPolicy>
  /** Label a job relevant / not relevant (null clears) — trains the model on the next pre-screen. */
  prescreenFeedback(id: string, relevant: boolean | null): Promise<PrescreenEntry | null>
  retrainPrescreen(): Promise<PrescreenModel>
  /** The optional local pre-screen model: Python found, installed, download sizes. */
  localModelStatus(): Promise<LocalModelStatus>
  /** Tracked install run (venv → packages → weights → self-test); cancel with cancelRun. */
  installLocalModel(): Promise<Run>
  evaluateJobs(ids: string[], force?: boolean): Promise<Run>
  setPortalGuideline(id: string, text: string): Promise<Portal>
  improvePortalGuideline(id: string, draft: string): Promise<Run>
  // Agent chat
  listThreads(): Promise<ChatThreadSummary[]>
  getThread(id: string): Promise<ChatThread>
  sendMessage(threadId: string | null, text: string, opts?: SendOptions): Promise<{ thread: ChatThread; run: Run }>
  /** A stored chat image as a data: URL. */
  attachmentData(threadId: string, attachmentId: string): Promise<string>
  renameThread(id: string, title: string): Promise<ChatThread>
  deleteThread(id: string): Promise<boolean>
  /** A finished Claude run → a chat on the same session (answer what the skill asked). */
  continueRun(runId: string): Promise<ChatThread>
  // Monitoring
  getMetrics(range?: DateRange | null): Promise<Metrics>
  // Integrations
  listIntegrations(): Promise<Integration[]>
  getIntegration(id: string): Promise<IntegrationDetail>
  previewInstall(url: string): Promise<InstallPreview>
  installIntegration(url: string): Promise<Run>
  integrationAction(id: string, action: IntegrationAction): Promise<IntegrationDetail | Run | null>
  setIntegrationConfig(id: string, patch: Record<string, string | boolean | null>): Promise<IntegrationDetail>
  /** Scrape a board's first page with Firecrawl and try JSON-LD (no agent tokens). */
  previewWebBoard(urls: string[]): Promise<WebBoardPreview>
  /** Track any job board (portals.yml `fetch: firecrawl`); instructions become its portal guideline. */
  addWebBoard(name: string, urls: string[], instructions: string, fetch?: 'firecrawl' | 'browser'): Promise<{ name: string }>
  /** Picked browser boards' domains still needing the one-time terms acknowledgement. */
  browserConsentNeeded(ids: string[]): Promise<string[]>
  acknowledgeBrowser(domains: string[]): Promise<boolean>
  // ————— Settings rebuild —————
  /** Keys with masked status only (hasKey + last four) — never a secret. */
  keysList(): Promise<KeyInfo[]>
  /** Save (value) or remove (null) a key after format validation; resolves with the fresh row. */
  keysSet(id: KeyId, value: string | null): Promise<KeyInfo>
  /** Cheapest possible call (no tokens); persists the result as the key's last test. */
  keysTest(id: KeyId): Promise<KeyTest>
  /** Providers with key presence only. */
  llmProviders(): Promise<ProviderRow[]>
  /** Strict patch: { helper: {provider, model} | null, customBaseUrl }. */
  llmSet(patch: { helper?: { provider: ProviderId; model: string | null } | null; customBaseUrl?: string | null }): Promise<LlmSettings>
  /** Everything the provider lists (cached 24 h); rejects with a readable reason when it cannot be listed. */
  llmModels(provider: ProviderId): Promise<LlmModelInfo[]>
  prefsGet(): Promise<Prefs>
  prefsSet(patch: PrefsPatch): Promise<Prefs>
  browserAcks(): Promise<string[]>
  browserRevoke(domain: string): Promise<string[]>
  dataLocations(): Promise<DataLocation[]>
  /** Opens one of the `dataLocations()` folders in Finder/Explorer; any other path is refused. */
  revealPath(path: string): Promise<boolean>
  /** Last N (≤200) lines of a run's log with credential-like lines dropped. */
  runLogTail(id: string, lines?: number): Promise<string>
  dataStats(): Promise<DataStats>
  dataClear(scope: ClearScope): Promise<PruneResult>
  /** Applies prefs.retention now (no-op while it is 'forever'). */
  retentionPrune(): Promise<PruneResult>
  settingsReset(scope: ResetScope): Promise<Settings>
  diagnostics(): Promise<Diagnostics>
  checkForUpdates(): Promise<UpdateStatus>
  // Pipeline
  setStatus(nums: number[], status: CanonicalStatus): Promise<{ updated: number[]; failed: Array<{ num: number; error: string }> }>
  getUpdateStatus(): Promise<UpdateStatus>
  onUpdateStatus(cb: (status: UpdateStatus) => void): () => void
  openExternal(url: string): Promise<void>
  platform: string
  arch: string
} & CopilotBridge & KbBridge & SkillsBridge

export type UpdateStatus = { currentVersion: string; latestVersion: string | null; updateAvailable: boolean; tag: string | null; storeManaged?: boolean }

/** Plain error shape that crosses the IPC boundary (kept name from codeburn). */
export type CliError = { kind: string; message: string; cold?: true }

// ————— Chart inputs kept from codeburn's components —————

export type Period = 'today' | 'week' | '30days' | 'month' | 'all' | 'lifetime'

/** ActivityHeatmap input. Careerloom feeds application counts through `cost`
 *  (intensity) and `calls` (label); the token fields are unused. */
export type DailyHistoryEntry = {
  date: string
  cost: number
  savingsUSD: number
  calls: number
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
  topModels?: Array<{ name: string; cost: number; calls: number; inputTokens: number; outputTokens: number }>
}

/** Sankey input: left column → right column, weighted by count. */
export type SpendFlowNode = { id: string; label: string; cost: number }
export type SpendFlowLink = { model: string; project: string; cost: number }
export type SpendFlow = {
  period: { label: string; start: string; end: string }
  models: SpendFlowNode[]
  projects: SpendFlowNode[]
  links: SpendFlowLink[]
}

// Feature contracts live in electron/contract.ts (types only) so the main
// process can import them without leaving its compile root.
export * from '../../electron/contract'
import type { BootstrapStatus, BootstrapStepId } from '../../electron/contract'
import type { CopilotBridge, KbBridge, SkillsBridge, ClearScope, DataLocation, DataStats, Diagnostics, KeyId, KeyInfo, KeyTest, LlmModelInfo, LlmSettings, ProviderId, ProviderRow, Prefs, PrefsPatch, PruneResult, ResetScope } from '../../electron/contract'
import type { AtsAnalyzeInput, AtsAnswer, AtsApplyResult, AtsEvent, AtsHistoryItem, AtsPreview, AtsReport } from '../../electron/contract'
import type { CanonicalStatus, SendOptions, ChatThread, LocalModelStatus, Prerequisites, PrescreenEntry, PrescreenModel, PrescreenPolicy, PrescreenRun, PrescreenStatus, Readiness, ChatThreadSummary, CvDocument, CvTemplate, ExtractedProfile, JobListing, Portal, ProfileResearch, DateRange, ExportFormat, InstallPreview, Integration, IntegrationAction, IntegrationDetail, Metrics, ResumeOverview, ResumeSource, RunUsage, WebBoardPreview, BrowserLoginStatus, PortalDetail, PortalPatch, ScanHistoryRow, JobView, Artifact, DocKind, DocsEvent, DocsOptions } from '../../electron/contract'
