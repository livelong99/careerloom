// Job knowledge base contract (types only; frozen at G-A, docs/plans/job-knowledge-base/plan.md §4–§7).
// Re-exported by electron/contract.ts and renderer/lib/types.ts. Additive changes go through WP0 only.
import type { DeepPartial } from '../copilot/types'
import type { InterviewPlan, TtsEngineId } from '../interviewer/types'

export type KbQuestionType = 'behavioural' | 'technical' | 'system-design' | 'coding' | 'situational' | 'recruiter'
/** Every item is exactly one of these; 'generated' is always labelled in the UI. */
export type Provenance = 'sourced' | 'generated' | 'user'
export type Expected = 'aware' | 'working' | 'strong' | 'expert'
export type Difficulty = 1 | 2 | 3 | 4 | 5
export type SourceKind = 'official-doc' | 'eng-blog' | 'github' | 'qa-site' | 'forum' | 'company-page' | 'other'
export type KbStatus = 'none' | 'running' | 'complete' | 'partial' | 'failed' | 'stale'
export type SearchBackendId = 'brave' | 'exa' | 'serper' | 'searxng'
export type ResearchSourceGroup = 'stackexchange' | 'github' | 'taxonomy' | 'hn' | 'companyPages' | 'articles'

export type SkillNode = {
  id: string; name: string; family: string | null; origin: 'jd' | 'gap' | 'cv' | 'taxonomy' | 'user'
  expected: Expected; /** 0..1 job relevance */ weight: number; inCv: boolean
}
/** No page text is ever stored, only its hash. */
export type SourceRef = {
  id: string; url: string; title: string; host: string; kind: SourceKind
  licence: string | null; fetchedAt: number; contentHash: string; trust: 0 | 1 | 2
}
export type KbRubricRow = { criterion: string; good: string; weak: string }
export type KbItem = {
  /** sha1(normalised text), so a refresh merges stably. */
  id: string
  /** The question in our own words, ≤ 300 chars. */
  text: string
  type: KbQuestionType; skills: string[]; difficulty: Difficulty
  provenance: Provenance; sources: Array<{ sourceId: string; /** ≤ 200 chars paraphrase */ note: string }>
  /** Distinct sources that surfaced it (frequency signal). */
  seen: number
  /** 0..1 = f(seen, trust, provenance). */
  confidence: number
  idealOutline: string[]; rubric: KbRubricRow[]; followUps: string[]; redFlags: string[]
  hooks: { storyIds: string[]; gap: string | null; cvFacts: string[] }
  user: { pinned: boolean; hidden: boolean; edited: boolean; notes: string | null }
  stats: { asked: number; lastScore: number | null; avgScore: number | null }
}
export type KbNotes = { company: string[]; role: string[]; interviewerStyle: string[]; loop: string[] }
export type KbManifest = {
  schema: 1; jobId: string; inputHash: string; researchedAt: number; runner: string; model: string | null
  costUsd: number; searches: number; pages: number; status: 'complete' | 'partial' | 'failed'; coverage: Record<string, number>
}

export type KbCoverage = { skillId: string; name: string; have: number; need: number; expected: Expected; inCv: boolean }
export type KbSummary = {
  jobId: string; status: KbStatus; researchedAt: number | null; items: number; sourcedPct: number; sources: number
  costUsd: number; inputChanged: boolean; runId: string | null; coverage: KbCoverage[]
  /** While `status` is 'running': the latest research step (stepper phase, pages done/total in `done`/`total`, spend, elapsed). Null/absent otherwise. Additive (lead-approved at the WP2 gate). */
  progress?: ResearchProgress | null
}
export type KbFilter = { types?: KbQuestionType[]; skills?: string[]; difficulty?: [number, number]; provenance?: Provenance[]; sourceKinds?: string[]; hidden?: boolean; text?: string }
/** What the renderer lists: never raw cv text (hooks are resolved at read time). */
export type KbItemView = Omit<KbItem, 'hooks' | 'sources'> & { sourceCount: number; whyForYou: string | null }
export type KbItemDetail = KbItemView & { sources: Array<{ source: SourceRef; note: string }>; hooks: KbItem['hooks'] }

export type ResearchOptions = { depth: 'quick' | 'standard' | 'deep'; budgetUsd: number; minutes: number; allowAgent: boolean; noSearch?: boolean }
export type ResearchEstimate = { usdLow: number; usdHigh: number; minutes: number; backend: SearchBackendId | 'none'; needsKey: boolean }
export type ResearchPhase = 'plan' | 'search' | 'fetch' | 'extract' | 'dedupe' | 'generate' | 'commit'
export type ResearchProgress = { runId: string; phase: ResearchPhase; done: number; total: number; spentUsd: number; elapsedMs: number; pages: number; itemsFound: number; skipped: number; note?: string }
/** Queries and skills the pipeline will run (built from the structured posting only, never the cv). */
export type ResearchPlan = { jobId: string; skills: SkillNode[]; queries: string[]; backend: SearchBackendId | 'none' }

export type VoiceInfo = { engine: TtsEngineId; id: string; name: string; lang: string; offline: boolean; installed: boolean; sizeMb: number | null; note: string | null }
/** contract v2: mean score (0..5) per KB skill id over a job's scored practice answers (Skill-up reads it). */
export type KbSkillSignal = { jobId: string; at: number; skills: Record<string, { avg: number; n: number }> }
/** contract v2 */
export type KokoroStatus = { supported: boolean; installed: boolean; installing: boolean; downloadMb: number }
export type PlanPreview = { questions: number; sourced: number; usd: number; minutes: number }

/** What an unimplemented stub handler resolves with (WP0 only; the owning package replaces it). */
export type KbNotImplemented = { status: 'not-implemented'; method: string }

export interface KbApi {
  kbSummary(jobId: string): KbSummary
  kbList(jobId: string, filter?: KbFilter): KbItemView[]
  kbItem(jobId: string, itemId: string): KbItemDetail
  kbEstimate(jobId: string, opts: ResearchOptions): ResearchEstimate
  kbResearchStart(jobId: string, opts: ResearchOptions): { runId: string }
  kbResearchStop(runId: string): void
  kbItemUpdate(jobId: string, itemId: string, patch: Partial<Pick<KbItem, 'text' | 'type' | 'skills' | 'difficulty'>> & { pinned?: boolean; hidden?: boolean; notes?: string | null }): KbItemView
  kbItemAdd(jobId: string, item: { text: string; type: KbQuestionType; skills: string[]; difficulty: Difficulty }): KbItemView
  /** User items only; every other item is hidden instead. */
  kbItemRemove(jobId: string, itemId: string): void
  /** Path written under userData/exports. */
  kbExport(jobId: string): string
  kbImport(jobId: string, file: string): { added: number; skipped: number }
  kbSearchKeyTest(): { ok: boolean; backend: string; message?: string }
  /** http(s) allow-list; resolves the id to the stored URL in main, then shell.openExternal. */
  kbOpenSource(sourceId: string): boolean
  /** contract v1.1: interview.json, validated and clamped; no secrets. */
  interviewConfig(): InterviewConfig
  interviewSetConfig(patch: DeepPartial<InterviewConfig>): InterviewConfig
  interviewVoices(): VoiceInfo[]
  interviewPreviewVoice(engine: TtsEngineId, voiceId: string, speed: number): void
  interviewInstallVoice(engine: 'kokoro'): { runId: string }
  /** contract v2: Settings > Local models row (install state of the Kokoro voice). */
  interviewKokoroStatus(): KokoroStatus
  /** contract v2: null until a scored AI-interviewer session exists for the job. */
  interviewSkillSignal(jobId: string): KbSkillSignal | null
  interviewPlanPreview(jobId: string, plan: InterviewPlan): PlanPreview
}

/** main → renderer (`broadcast('careerloom:<name>', payload)`), except `ttsPlayback` which is renderer → main (`send`). */
export type KbEvents = {
  kbProgress: ResearchProgress
  kbChanged: { jobId: string }
  interviewerState: { state: 'speaking' | 'thinking' | 'listening' | 'idle'; questionId: string | null; voice: string | null; /** contract v2: speakers mode, the mic is paused while the voice plays. */ micPaused?: boolean }
  ttsPlayback: { phase: 'started' | 'ended' | 'cancelled'; utteranceId: string }
  /** contract v2: one short line for the overlay ("Kokoro is unavailable, using the system voice"). */
  interviewerNotice: { text: string }
}
/** main → overlay PCM (`send`, channel `careerloom:ttsAudio`). */
export type TtsAudioMsg = { utteranceId: string; seq: number; pcm16: ArrayBuffer; sampleRate: 24000; last: boolean }

type Promisified<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<R> : never }
/** Added to `window.careerloom` (preload). */
export type KbBridge = Promisified<KbApi> & {
  onKbEvent<K extends Exclude<keyof KbEvents, 'ttsPlayback'>>(event: K, cb: (payload: KbEvents[K]) => void): () => void
  kbTtsPlayback(msg: KbEvents['ttsPlayback']): void
  /** contract v2: PCM from main (`careerloom:ttsAudio`); the overlay plays it once armed. */
  onTtsAudio(cb: (m: TtsAudioMsg) => void): () => void
}

// ————— interview.json (plan §7) —————
export type InterviewConfig = {
  version: 1
  research: {
    /** null = the helper tier. */
    model: string | null; depth: ResearchOptions['depth']; budgetUsd: number; minutes: number; allowAgent: boolean
    search: { backend: SearchBackendId; fallbackOrder: SearchBackendId[]; searxngUrl: string | null }
    sources: Record<ResearchSourceGroup, boolean>
    consentVersion: string | null; refreshAfterDays: number
  }
  voice: { engine: TtsEngineId; voiceId: string | null; speed: number; echo: 'speakers' | 'headphones'; tailMs: number; /** Electron accelerator */ pushToInterrupt: string }
  kb: { retentionDays: number | null; maxItems: number; /** Use the job's question base in live Copilot sessions. */ useInLive: boolean }
}
