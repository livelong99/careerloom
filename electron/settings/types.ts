// Settings-rebuild contract (types only). Re-exported by electron/contract.ts and renderer/lib/types.ts.
// Secrets never appear here: the renderer only ever sees `hasKey` + the last four characters.

export type KeyId = 'openrouter' | 'opencode' | 'firecrawl' | 'brave' | 'exa' | 'serper'

/** Result of one connection test (persisted in settings.json `keyMeta`, no secret in it). */
export type KeyTest = { ok: boolean; latencyMs: number | null; detail: string; at: number }

export type KeyInfo = {
  id: KeyId
  label: string
  hasKey: boolean
  /** Last four characters of the saved key, null when unset. */
  tail: string | null
  optional: boolean
  /** Human "used by" list, e.g. 'API runner'. */
  usedBy: string[]
  /** Runner ids that cannot work without this key. */
  neededByRunners: string[]
  helpUrl: string | null
  /** One line on the accepted format, shown under the input. */
  formatHint: string
  lastTest: KeyTest | null
}

export type DocsDefaults = { tone: 'concise' | 'warm' | 'formal'; length: 'short' | 'standard'; humanize: boolean }

/** Operational preferences kept in settings.json. Theme, language and refresh cadence stay renderer-side (localStorage). */
export type Prefs = {
  updates: { enabled: boolean }
  /** null = keep run logs forever. */
  retention: { runLogDays: number | null }
  docs: DocsDefaults
  /** Debug log mode: a folder = on (app, agent and Copilot activity is appended there); null = off. */
  debug: { dir: string | null }
}
export type PrefsPatch = { updates?: Partial<Prefs['updates']>; retention?: Partial<Prefs['retention']>; docs?: Partial<DocsDefaults>; debug?: Partial<Prefs['debug']> }

export type DataLocation = { id: 'appData' | 'careerOps' | 'models' | 'copilot'; label: string; path: string | null }
export type DataStats = { runs: number; runLogFiles: number; runLogBytes: number; threads: number; copilotSessions: number }
export type PruneResult = { removedFiles: number; freedBytes: number }
export type ClearScope = 'run-logs' | 'chats'
/** `preferences` keeps the folder, runner, models and keys; `everything` also removes saved keys. */
export type ResetScope = 'preferences' | 'everything'

export type DiagnosticRow = { id: string; label: string; value: string | null; status: 'ok' | 'warn' | 'missing'; hint?: string }
export type Diagnostics = { rows: DiagnosticRow[]; memory: { totalBytes: number; freeBytes: number /** available, not just free pages (see memory.ts) */ } }
