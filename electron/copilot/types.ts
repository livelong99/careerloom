// Interview Copilot contract (plan.md §4–§7). FROZEN at gate G-A: changes go through the WP0 owner only.
// Types only, so both the main process and the renderer can import it.

export type CopilotMode = 'practice' | 'live'
export type Speaker = 'interviewer' | 'you'
export type QuestionType = 'behavioural' | 'technical' | 'system-design' | 'coding' | 'other'
export type CopilotState = 'idle' | 'armed' | 'listening' | 'stopped'
export type OverlayViewState = 'idle' | 'listening' | 'question' | 'answering' | 'answered' | 'permission' | 'error' | 'stopped'
export type SourceId = 'mic' | 'system'
export type InterviewType = 'recruiter' | 'behavioural' | 'technical' | 'system-design' | 'mixed'
export type Anchor = 'tl' | 'tc' | 'tr' | 'ml' | 'c' | 'mr' | 'bl' | 'bc' | 'br'
export type StopReason = 'user' | 'panic' | 'error'
/** Mirrors Electron's `systemPreferences.getMediaAccessStatus`. */
export type PermStatus = 'granted' | 'denied' | 'not-determined' | 'restricted' | 'unknown'
import type { StageMs, TraceSummary } from './trace'
export type DeepPartial<T> = { [K in keyof T]?: T[K] extends readonly unknown[] ? T[K] : T[K] extends object ? DeepPartial<T[K]> : T[K] }

export type TranscriptLine = { id: string; speaker: Speaker; text: string; final: boolean; t0: number; t1: number | null }
/** What the question gate learned about a turn (PERF-2); advisory, never authority. Additive, absent on older sessions. */
export type QuestionHint = { kind: 'coding' | 'system-design' | 'behavioural' | 'factual' | 'small-talk'; complete: boolean; needsScreenshot: boolean; deep: boolean; source: 'heuristic' | 'jev'; /** model round trip, when a model answered */ gateMs?: number }
export type DetectedQuestion = { id: string; text: string; type: QuestionType; confidence: number; at: number; auto: boolean; hint?: QuestionHint }
export type Suggestion = {
  questionId: string; model: string; tier: 'fast' | 'balanced' | 'deep'
  say: string; bullets: string[]; star: { s: string; t: string; a: string; r: string } | null
  proof: Array<{ quote: string; source: string }>; flags: Array<{ kind: 'unsupported-number' | 'unsupported-skill' | 'unsupported-name'; text: string }>
  done: boolean; firstTokenMs: number | null; totalMs: number | null; costUsd: number | null
  /** Numbers-only stage timings of this turn (PERF-1); additive, absent on older sessions. */
  trace?: StageMs
}
export type SourceHealth = { source: SourceId; status: 'ok' | 'silent' | 'denied' | 'missing'; level: number }

export type ConsentRecord = {
  id: string; sessionId: string; at: number; textVersion: string
  aiAllowedConfirmed: boolean; everyoneInformedConfirmed: boolean; jurisdiction: string | null
  sources: SourceId[]; sttProvider: string | null; llmProvider: string | null; transcriptSaved: boolean
  privacyMode: boolean; indicator: 'chip' | 'dot' | 'off'
}
/** `jobId` is required: every session belongs to exactly one Job. Title/company are snapshots that survive job deletion. */
export type SessionSummary = { id: string; startedAt: number; endedAt: number | null; mode: CopilotMode; jobId: string; jobTitle: string; company: string; questions: number; durationSec: number; score: number | null }
export type Scorecard = { structure: number; specifics: number; evidence: number; concision: number; notes: Array<{ questionId: string; tip: string; suggestedLine: string | null }> }
export type SessionDetail = SessionSummary & { transcript: TranscriptLine[]; questionsList: DetectedQuestion[]; suggestions: Suggestion[]; scorecard: Scorecard | null
  /** p50/p95 stage latencies over this session's answers, derived on read from `suggestions[].trace`. */
  latency?: TraceSummary }

/** `questionIds`/`custom` (practice only): the chosen report questions and the user's own. Additive to the frozen contract. */
export type StartRequest = { mode: CopilotMode; jobId: string; interviewType: InterviewType; consent: ConsentRecord | null /* required for live */; questionIds?: string[]; custom?: string[] }
/** `start` restarts the last practice session, `retry` reopens speech recognition for the running one, `debrief` opens the last session in Careerloom (overlay buttons). Additive. */
export type OverlayCommand = { collapse?: boolean; hide?: boolean; quickHide?: boolean; passive?: boolean; moveTo?: Anchor; start?: boolean; retry?: boolean; debrief?: boolean }
export type SttEngineId = 'moonshine' | 'whisper-mlx' | 'faster-whisper'
export type SttDevice = 'auto' | 'cpu' | 'coreml' | 'cuda'
/** p95FinalMs: tail of end-of-speech → final text. faster-whisper adds the device that really ran and per-decode p50/p95 (GPU time without the endpoint wait). */
export type SttBenchmark = { at: number; p50FinalMs: number; realTimeFactor: number; ramMb: number | null; wer: number | null; p95FinalMs?: number; p50DecodeMs?: number; p95DecodeMs?: number; device?: 'cuda' | 'cpu' }
export type SttModelInfo = { engine: SttEngineId; model: string; sizeMb: number | null; installed: boolean; devices: Array<'cpu' | 'coreml' | 'cuda'>; lastBenchmark: SttBenchmark | null; recommended: boolean }
/** What the user can do about a model/provider error (rendered as buttons). */
export type ErrorAction = 'change-model' | 'privacy-settings' | 'manage-key'
export type LlmModelInfo = { id: string; name: string; contextTokens: number | null; promptUsdPerM: number | null; completionUsdPerM: number | null; dataPolicy: 'unknown' | 'no-collect' | 'may-collect'; supportsStreaming: boolean; /** accepts image input (OpenRouter architecture.input_modalities) */ vision?: boolean }
export type PracticeQuestion = { id: string; text: string; type: QuestionType; source: 'report' | 'custom'; lastScore: number | null }
/** What the grounding prefix is built from; counts are for the Setup tiles. */
export type ContextSummary = { jobId: string; title: string; company: string; hasPosting: boolean; hasReport: boolean; hasCv: boolean; stories: number }
export type ContextPreview = { tokens: number; posting: number; strengths: number; gaps: number; facts: number; stories: number; text: string }

// ————— Config (copilot.json, plan §7) —————
export type CopilotConfig = {
  version: 1
  audio: { micDeviceId: string | null; useSystem: boolean; systemSource: 'loopback' | 'virtual'; virtualDeviceId: string | null }
  stt: { engine: SttEngineId; model: string | null; device: SttDevice; language: 'en'; lastBenchmark: SttBenchmark | null; endSilenceMs: number; vocab: string[] }
  engine: {
    tier: 'fast' | 'balanced' | 'deep'; escalateForDesignCoding: boolean; provider: 'openrouter'
    /** `policyMigrated`: the one-time move of older saved 'deny' to the user-approved 'allow' default has run; after it, the user's choice is respected. */
    openrouter: { dataCollection: 'deny' | 'allow'; zdr: boolean; sort: 'latency' | 'price'; policyMigrated: boolean }
    models: Record<'fast' | 'balanced' | 'deep', string | null>
    factCheck: boolean; vision: 'vision' | 'ocr'; autoAnswer: boolean
    /** Screen reading (screenshots sent to a vision model). Off until the user opts in; Screen Recording permission is asked for separately. */
    screenshots: boolean
    /** Start the answer on a stable end-of-turn partial; aborted and restarted if the final differs (PERF-2, default off). */
    speculativeStart: boolean
    /** Ambiguous interviewer lines: local rules only, or also ask the Jev decision model (PERF-2, default rules only). */
    gate: { engine: 'heuristic' | 'jev'; baseUrl: string; endpoint: 'systemone' | 'decisions' }
  }
  coaching: { shape: 'cues' | 'cues+star' | 'script'; length: 1 | 2 | 3; tone: 'direct' | 'warm' | 'formal'; persona: string; quoteResume: boolean }
  overlay: { layout: 'strip' | 'panel'; anchor: Anchor; displayId: number | null; width: number; fontPx: number; opacity: number; theme: 'app' | 'dark' | 'light'; clickThroughIdle: boolean; aboveFullscreen: boolean }
  hotkeys: Record<'answer' | 'followup' | 'clarify' | 'screenshot' | 'summarise' | 'expand' | 'listen' | 'toggle' | 'quickHide', string> & { panic: string }
  privacy: {
    retentionDays: number | null; localOnly: boolean; redact: boolean
    mode: { enabled: boolean; noticeVersion: string | null; hideFromCapture: boolean; noDockIcon: boolean; neutralTitle: boolean; indicator: 'chip' | 'dot' | 'off' }
  }
  practice: { followups: boolean; readAloud: boolean; answerMinutes: number }
}

// ————— IPC: renderer → main (invoke `careerloom:<name>`) —————
export interface CopilotApi {
  copilotGetConfig(): CopilotConfig
  copilotSetConfig(patch: DeepPartial<CopilotConfig>): CopilotConfig
  /** `stt` is 'not-installed' until the local engine/model is installed (local STT has no key). */
  copilotReadiness(jobId: string): { context: ContextSummary; mic: PermStatus; system: PermStatus; stt: 'ready' | 'not-installed'; engine: 'ready' | 'no-key' }
  copilotContextPreview(jobId: string): ContextPreview
  copilotProbeAudio(source: SourceId, ms: number): SourceHealth
  copilotOpenSystemSettings(pane: 'microphone' | 'system-audio' | 'screen'): boolean
  copilotStart(req: StartRequest): { sessionId: string }
  copilotStop(reason: StopReason): void
  copilotAnswer(kind: 'answer' | 'followup' | 'clarify' | 'summarise', questionId?: string): void
  copilotScreenshot(): void
  copilotOverlay(cmd: OverlayCommand): void
  copilotAckPrivacyNotice(version: string): { ok: boolean }
  copilotListSessions(filter?: { jobId?: string }): SessionSummary[]
  copilotSessionsForJob(jobId: string): { sessions: SessionSummary[]; trend: Array<{ sessionId: string; at: number; score: number | null }> }
  copilotGetSession(id: string): SessionDetail | null
  copilotDeleteSession(id: string | 'all'): number
  copilotExportConsents(): string
  copilotPracticeQuestions(jobId: string): PracticeQuestion[]
  copilotListSttModels(): SttModelInfo[]
  copilotBenchmarkStt(sel: { engine: SttEngineId; model: string; device: SttDevice }): SttBenchmark
  /** Starts the optional local speech-model install (a run in the run history). Additive. */
  copilotInstallStt(model?: string): { runId: string }
  copilotListLlmModels(): LlmModelInfo[]
  copilotTestLlmModel(id: string): { firstTokenMs: number | null; ok: boolean; message?: string; code?: string; actions?: ErrorAction[] }
  copilotCheckHotkey(accel: string): { ok: boolean; reason?: 'in-use' | 'reserved' | 'invalid' }
  copilotApplyDebrief(sessionId: string, questionId: string, action: 'resume-bullet' | 'job-note'): { ok: boolean }
}

/** Renderer → main, high-rate (`ipcRenderer.send`, channel `careerloom:copilotAudio`). */
export type AudioChunkMsg = { source: SourceId; pcm16: ArrayBuffer; t: number }

// ————— main → renderer (`broadcast('careerloom:<name>', payload)`) —————
export type CopilotEvents = {
  copilotState: { state: CopilotState; mode: CopilotMode; sessionId: string | null; sources: SourceId[]; startedAt: number | null }
  copilotTranscript: TranscriptLine
  copilotQuestion: DetectedQuestion
  copilotSuggestion: Suggestion                 // repeated, `done:false` while streaming; throttle ≤ 12/s
  copilotHealth: SourceHealth
  copilotError: { kind: 'stt' | 'engine' | 'capture' | 'hotkey'; message: string; retrying: boolean; attempt?: number; actions?: ErrorAction[]; suggestion?: string }
  /** Screenshot action state for the overlay button; `idle` clears it. */
  copilotScreen: { state: 'idle' | 'capturing' | 'sent' | 'ready' | 'blocked'; reason?: 'permission' | 'off' | 'ocr' | 'no-vision' | 'budget' | 'failed'; /** shown under the actions (not an error panel: capture and answers keep running) */ message?: string; /** a vision model to offer */ suggestion?: string }
  copilotLevel: { source: SourceId; level: number }     // 0..1, ≤ 15/s
}

/** What an unimplemented stub handler resolves with (WP0 only; real handlers replace it). */
export type NotImplemented = { status: 'not-implemented'; method: string }

type Promisified<T> = { [K in keyof T]: T[K] extends (...a: infer A) => infer R ? (...a: A) => Promise<R> : never }
/** Added to `window.careerloom` (preload). */
export type CopilotBridge = Promisified<CopilotApi> & {
  onCopilotEvent<K extends keyof CopilotEvents>(event: K, cb: (payload: CopilotEvents[K]) => void): () => void
  copilotAudio(msg: AudioChunkMsg): void
}
