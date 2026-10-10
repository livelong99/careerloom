// Shared main-process context: settings, the career-ops data root, the run
// launcher and history. Feature modules (resume, metrics, integrations,
// tracker-actions) build their IPC handlers on these; only main.ts registers them.
import { app, BrowserWindow, safeStorage } from 'electron'
import { spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import fs from 'node:fs'
import path from 'node:path'

import { dropRunLines } from './runs-prune'
import { defaultPrefs, normalizeKeyMeta, normalizePrefs } from './settings/prefs'
import { defaultLlm, normalizeLlm, type LlmSettings } from './llm/settings'
import type { KeyId, KeyTest, Prefs } from './settings/types'
import { agyDenied, ensureAgyProject } from './agy-project'
import { checkRoot } from './careerops'
import { logTail } from './scan-history'
import { NEEDS_ZEN_KEY, opencodeConfig, opencodeEnv, opencodeTextConfig, zenModel } from './opencode'
import { agyFormatter, agyResultOk, agySessionId, agyUsage, argsFor, argsForPrompt, claudeSessionId, formatOpencodeLine, isModelId, claudeUsage, formatClaudeLine, isRunner, MODES, opencodeResultOk, opencodeSessionId, opencodeUsage, promptFor, resolveBin, RUNNERS, spawnSpec, startRun, type CliRunner, type ModeId, type PromptOptions, type RunnerId, type RunUsage, type SpawnSpec } from './runner'
import { debugLog } from './debug-log'
import { prepareSkills, type PreparedSkills } from './skills/inject'
import { imageArgs } from './image-support'
import type { Attachment } from './skills/types'
import { BROWSER_SYSTEM, runZen, zenPrompt, zenSystem, type BrowserTools } from './zen-agent'

export type Handler = (...args: unknown[]) => unknown

export const str = (v: unknown, name: string): string => {
  if (typeof v !== 'string') throw new Error(`${name} must be a string`)
  return v
}

// ————— Settings (userData/settings.json) + API key (safeStorage) —————

export type { CliRunner }
/** Runners with a model setting (every one but career-ops' OpenRouter script). */
export type ModelRunner = Exclude<RunnerId, 'api'>
export type Settings = { root: string | null; runner: RunnerId; models: Partial<Record<ModelRunner, string>>; /** Cheap model per runner for structuring/humanizing calls (unset = built-in default). */ helperModels: Partial<Record<ModelRunner, string>>; /** Operational preferences (additive: a v0.1.1 file has none). */ prefs: Prefs; /** Last connection test per key — never the key. */ keyMeta: Partial<Record<KeyId, KeyTest>>; /** Provider assignment for helper calls + custom server address. */ llm: LlmSettings }
const defaultSettings = (): Settings => ({ root: null, runner: 'claude', models: {}, helperModels: {}, prefs: defaultPrefs(), keyMeta: {}, llm: defaultLlm() })

export const userFile = (name: string) => path.join(app.getPath('userData'), name)

const modelMap = (v: unknown) => Object.fromEntries(Object.entries(v ?? {}).filter(([k, m]) => k !== 'api' && (RUNNERS as string[]).includes(k) && isModelId(m)))

function parseSettings(raw: Partial<Settings>): Settings {
  return {
    root: typeof raw.root === 'string' ? raw.root : null,
    runner: isRunner(raw.runner) ? raw.runner : 'claude',
    models: modelMap(raw.models),
    helperModels: modelMap(raw.helperModels),
    prefs: normalizePrefs(raw.prefs),
    keyMeta: normalizeKeyMeta(raw.keyMeta),
    llm: normalizeLlm(raw.llm),
  }
}

const readRaw = (file: string): Record<string, unknown> | null => {
  try {
    const v = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown
    return v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null
  } catch { return null }
}

/** Never throws: a missing, corrupt or old (v0.1.1) file loads as defaults filled in from whatever is valid. A corrupt file falls back to the last good `.bak`. */
export function readSettings(): Settings {
  const file = userFile('settings.json')
  return parseSettings((readRaw(file) ?? readRaw(`${file}.bak`) ?? {}) as Partial<Settings>)
}

/** Atomic (tmp + rename) shallow merge. Fields this version doesn't know are preserved; the previous good file is kept once as `.bak`. */
export function writeSettings(patch: Partial<Settings>): Settings {
  const file = userFile('settings.json')
  const existing = readRaw(file)
  const next = { ...readSettings(), ...patch }
  fs.mkdirSync(app.getPath('userData'), { recursive: true })
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, JSON.stringify({ ...existing, ...next }, null, 2))
  if (existing) fs.copyFileSync(file, `${file}.bak`)
  fs.renameSync(tmp, file)
  return next
}

/** Secrets never cross to the renderer; only "is it set" does. */
export function readSecret(name: string): string | null {
  try { return safeStorage.decryptString(fs.readFileSync(userFile(`${name}.key`))) } catch { return null }
}

export function writeSecret(name: string, value: string | null): void {
  const file = userFile(`${name}.key`)
  if (!value) { fs.rmSync(file, { force: true }); return }
  if (!safeStorage.isEncryptionAvailable()) throw new Error('OS keychain unavailable — cannot store the key securely')
  fs.writeFileSync(file, safeStorage.encryptString(value.trim()), { mode: 0o600 })
}

export const readApiKey = () => readSecret('openrouter')
/** Optional OpenCode Zen key (paid models) for the opencode and zen runners. */
export const readOpencodeKey = () => readSecret('opencode')

/** The career-ops checkout (system layer: modes, scripts). */
export function careerOpsRoot(): string {
  const { root } = readSettings()
  if (!root) throw new Error('Pick your career-ops folder in Settings first')
  const check = checkRoot(root)
  if (!check.ok) throw new Error(check.reason)
  return check.root
}

/** Where the user's files live (cv.md, data/, reports/) — usually the same folder. */
export function dataRoot(): string {
  const check = checkRoot(careerOpsRoot())
  return check.ok ? check.dataRoot : careerOpsRoot()
}

/** Resolve `rel` inside `base`, refusing absolute paths and anything that escapes it. */
export function inside(base: string, rel: string): string {
  const full = path.resolve(base, rel)
  if (path.isAbsolute(rel) || !full.startsWith(path.resolve(base) + path.sep)) throw new Error('Path is outside the career-ops folder')
  return full
}

const QUIET_EVENTS = new Set(['careerloom:copilotLevel', 'careerloom:copilotOverlay'])
export function broadcast(channel: string, payload: unknown): void {
  if (!QUIET_EVENTS.has(channel) && !(channel === 'careerloom:copilotTranscript' && (payload as { final?: unknown } | null)?.final === false)) debugLog('event', channel, payload)
  for (const win of BrowserWindow.getAllWindows()) if (!win.isDestroyed()) win.webContents.send(channel, payload)
}

// ————— Deterministic career-ops scripts (no agent, no tokens) —————

export type ScriptResult = { code: number | null; stdout: string; stderr: string }

/** Run `node <script> ...args` in the career-ops folder and collect output.
 *  argv only (shell: false); callers validate args. */
export function runScript(args: string[], opts: { timeoutMs?: number; env?: NodeJS.ProcessEnv } = {}): Promise<ScriptResult> {
  const cwd = careerOpsRoot()
  const spec: SpawnSpec = resolveBin('node')
    ? spawnSpec('node', args, opts.env)
    : { bin: process.execPath, args, env: { ...process.env, ...opts.env, ELECTRON_RUN_AS_NODE: '1' } }
  return new Promise((resolve, reject) => {
    const child = spawn(spec.bin, spec.args, { cwd, env: spec.env, shell: false, windowsHide: true, ...(spec.verbatim ? { windowsVerbatimArguments: true } : {}) })
    let stdout = ''
    let stderr = ''
    const timer = setTimeout(() => child.kill('SIGTERM'), opts.timeoutMs ?? 120_000)
    child.stdout.setEncoding('utf8').on('data', (t: string) => { stdout += t })
    child.stderr.setEncoding('utf8').on('data', (t: string) => { stderr += t })
    child.on('error', err => { clearTimeout(timer); reject(err) })
    child.on('close', code => {
      clearTimeout(timer)
      // A checkout without node_modules fails every script the same way; say what fixes it.
      if (code !== 0 && /ERR_MODULE_NOT_FOUND|Cannot find package/.test(stderr)) {
        return reject(new Error('career-ops dependencies are not installed — run `npm install` in its folder (Integrations → career-ops → Repair)'))
      }
      resolve({ code, stdout, stderr })
    })
  })
}

// ————— Agent runs: streamed to every window, history persisted —————

export type RunStatus = 'running' | 'done' | 'failed' | 'cancelled'
export type RunRecord = {
  id: string
  runner: RunnerId | 'setup' | 'script' | 'research'
  mode: string
  label: string
  input: string | null
  startedAt: number
  endedAt: number | null
  status: RunStatus
  usage: RunUsage | null
  /** Claude session id (from stream-json init) — lets chat continue the conversation. */
  sessionId?: string | null
  /** The job this run was started for (evaluate, tailored CV, cover letter, ATS, posting structuring); the Runs page groups by it. */
  jobId?: string | null
  log: string
}
/** What a run is created from. */
export type RunStart = Pick<RunRecord, 'runner' | 'mode' | 'label' | 'input' | 'jobId'>
export type RunSummary = Omit<RunRecord, 'log'>

const LOG_CAP = 256 * 1024 // chars kept per run in memory
export const runs = new Map<string, RunRecord>()
const HISTORY_FILE = 'runs.jsonl'

/** Every finished run, oldest first (userData/runs.jsonl, one JSON summary per line). */
export function readRunHistory(): RunSummary[] {
  try {
    return fs.readFileSync(userFile(HISTORY_FILE), 'utf8').split('\n').filter(Boolean).flatMap(line => {
      try { return [JSON.parse(line) as RunSummary] } catch { return [] }
    })
  } catch {
    return []
  }
}

/** Scan runs keep their log after the app restarts (runs.jsonl holds summaries only): the last
 *  LOG_TAIL_LINES lines, minus anything that looks like a credential, in userData/run-logs/. */
const TAIL_MODES = new Set(['scan', 'web-board'])
const runLogFile = (id: string) => userFile(path.join('run-logs', `${id.replace(/[^\w-]/g, '')}.log`))

function saveLogTail(run: RunRecord): void {
  if (!TAIL_MODES.has(run.mode)) return
  try {
    fs.mkdirSync(path.dirname(runLogFile(run.id)), { recursive: true })
    fs.writeFileSync(runLogFile(run.id), logTail(run.log), { mode: 0o600 })
  } catch (err) { console.error('run log write failed:', err) }
}

/** A run's log: live from memory, else the saved tail of a past scan run, else ''. */
export function runLog(id: string): string {
  const live = runs.get(id)?.log
  if (live !== undefined) return live
  try { return fs.readFileSync(runLogFile(id), 'utf8') } catch { return '' }
}

/** Forget finished runs: their history lines, saved log tails and in-memory records. Running runs are kept. Returns how many went. */
export function deleteRunRecords(ids: string[]): number {
  const gone = new Set(ids.filter(id => runs.get(id)?.status !== 'running'))
  if (!gone.size) return 0
  let removed: string[] = []
  try {
    const res = dropRunLines(fs.readFileSync(userFile(HISTORY_FILE), 'utf8'), gone)
    removed = res.removed
    fs.writeFileSync(userFile(HISTORY_FILE), res.text)
  } catch (err) { if ((err as NodeJS.ErrnoException).code !== 'ENOENT') console.error('run history rewrite failed:', err) }
  for (const id of gone) {
    if (runs.delete(id)) removed.push(id)
    try { fs.rmSync(runLogFile(id), { force: true }) } catch { /* already gone */ }
  }
  return new Set(removed).size
}

function appendRunHistory(run: RunSummary): void {
  try { fs.appendFileSync(userFile(HISTORY_FILE), JSON.stringify(run) + '\n') } catch (err) { console.error('run history write failed:', err) }
}

export function summary(run: RunRecord): RunSummary {
  const { log: _log, ...rest } = run
  return rest
}

export type LaunchOptions = {
  /** stdout stream-json line → text appended verbatim (carries its own newlines), or null.
   *  stderr is shown raw. */
  format?: (line: string) => string | null
  onSuccess?: () => void
  /** Masked out of every chunk (API keys a child might print). */
  secret?: string
  /** Fires once when the run ends, with its final record (chat uses it to persist). */
  onExit?: (run: RunRecord) => void
}

export function launch(record: RunStart, steps: Array<{ spec: SpawnSpec; cwd: string }>, opts: LaunchOptions = {}): RunRecord {
  const run: RunRecord = { ...record, id: randomUUID(), startedAt: Date.now(), endedAt: null, status: 'running', usage: null, log: '' }
  runs.set(run.id, run)
  const append = (raw: string) => {
    const text = opts.secret ? raw.replaceAll(opts.secret, 'sk-or-…') : raw
    run.log = (run.log + text).slice(-LOG_CAP)
    broadcast('careerloom:run', { id: run.id, kind: 'chunk', text })
  }
  let pending = ''
  let resultOk: boolean | null = null
  // Usage, session id and final status come from either CLI's stream-json events.
  const consume = (lines: string[]) => {
    for (const line of lines) {
      run.usage = claudeUsage(line) ?? agyUsage(line) ?? opencodeUsage(line, run.usage) ?? run.usage
      run.sessionId = claudeSessionId(line) ?? agySessionId(line) ?? opencodeSessionId(line) ?? run.sessionId
      resultOk = agyResultOk(line) ?? opencodeResultOk(line) ?? resultOk
    }
    const shown = lines.map(l => opts.format!(l)).filter((l): l is string => l !== null)
    if (shown.length) append(shown.join(''))
  }
  const finish = () => {
    run.endedAt = Date.now()
    appendRunHistory(summary(run))
    saveLogTail(run)
    broadcast('careerloom:run', { id: run.id, kind: 'exit', status: run.status })
    try { opts.onExit?.(run) } catch (err) { console.error('run onExit failed:', err) }
  }
  const next = (i: number) => {
    const step = steps[i]!
    startRun(run.id, step.spec, step.cwd, {
      onChunk: (stream, text) => {
        if (!opts.format || stream === 'err') return append(text)
        // stream-json is line-delimited; hold the partial tail until its newline.
        const lines = (pending + text).split('\n')
        pending = lines.pop() ?? ''
        consume(lines)
      },
      onExit: code => {
        if (pending) { consume([pending]); pending = '' }
        if (run.status === 'cancelled') return finish()
        // No exit code = killed by a signal (Careerloom quit mid-run, or the OS stopped it): an interruption, not a failure.
        if (code === null) { append('\n■ Stopped before it finished (Careerloom quit or the process was killed).\n'); run.status = 'cancelled'; return finish() }
        if (code === 0 && i + 1 < steps.length) return next(i + 1)
        // agy exits 0 even when headless mode denied every tool — don't report that as done.
        run.status = code === 0 && resultOk !== false && !(run.runner === 'antigravity' && agyDenied(run.log)) ? 'done' : 'failed'
        if (code === 0) opts.onSuccess?.()
        finish()
      },
    })
  }
  next(0)
  return run
}

/** A tracked run for in-process work (no child process): `work` streams via `log`; a throw
 *  marks it failed. Cancel only flips `run.status` — `work` checks it between steps. */
export function launchTask(record: RunStart, work: (log: (text: string) => void, run: RunRecord) => Promise<void>, onExit?: (run: RunRecord) => void): RunRecord {
  const run: RunRecord = { ...record, id: randomUUID(), startedAt: Date.now(), endedAt: null, status: 'running', usage: null, log: '' }
  runs.set(run.id, run)
  const log = (text: string) => {
    run.log = (run.log + text).slice(-LOG_CAP)
    broadcast('careerloom:run', { id: run.id, kind: 'chunk', text })
  }
  void work(log, run)
    .then(() => { if (run.status === 'running') run.status = 'done' }, err => {
      log(`\n✗ ${err instanceof Error ? err.message : String(err)}\n`)
      if (run.status === 'running') run.status = 'failed'
    })
    .finally(() => {
      run.endedAt = Date.now()
      appendRunHistory(summary(run))
      saveLogTail(run)
      broadcast('careerloom:run', { id: run.id, kind: 'exit', status: run.status })
      try { onExit?.(run) } catch (err) { console.error('run onExit failed:', err) }
    })
  return run
}

// ————— Starting agent work (used by main's startRun and by feature modules) —————

// ————— Installed skills: every agent run may use them (the "engine" is career-ops + these) —————

export type SkillContext = { dirs: string[]; note: string | null }
let skillContext: () => SkillContext = () => ({ dirs: [], note: null })
/** Registered by main (integrations registry) — kept as a hook to avoid an import cycle. */
export function setSkillContext(fn: () => SkillContext): void { skillContext = fn }

function promptOptions(extra: PromptOptions = {}): PromptOptions {
  const skills = skillContext()
  const { runner, models } = readSettings()
  const model = runner === 'api' || runner === 'zen' ? undefined : models[runner]
  const agyProject = runner === 'antigravity' ? ensureAgyProject(careerOpsRoot(), skills.dirs) : undefined
  return { addDirs: skills.dirs, systemAppend: skills.note ?? undefined, model, agyProject, ...extra }
}

/** Per-run stdout formatter for the CLIs that stream JSON (claude, agy); tool steps name
 *  absolute paths, shown relative to the career-ops folder. */
export function streamFormat(runner: RunnerId, root: string): ((line: string) => string | null) | undefined {
  const rel = (s: string | null) => s?.replaceAll(`${root}/`, '') ?? null
  if (runner === 'claude') return line => { const out = rel(formatClaudeLine(line)); return out === null ? null : `${out}\n` }
  if (runner === 'antigravity') { const fmt = agyFormatter(); return line => rel(fmt(line)) }
  if (runner === 'opencode') return line => rel(formatOpencodeLine(line))
  return undefined
}

/** Launch a career-ops mode with the configured runner. `input` is validated by promptFor.
 *  `skills` is this run's explicit Agent Skill set; omitted = every enabled skill. */
export function startAgent(mode: ModeId, input?: string, extraEnv: NodeJS.ProcessEnv = {}, skills?: string[]): RunSummary {
  const { runner } = readSettings()
  if (runner === 'zen') return startZen({ runner, mode, label: MODES[mode].label, input: input ?? null }, promptFor(mode, input), { env: extraEnv, skills })
  const root = careerOpsRoot()
  const injected = prepareSkills(runner, root, skills)
  try {
    const { bin, args } = argsFor({ runner, mode, input }, promptOptions({ skillsHint: injected.promptHint ?? undefined }))
    let spec: SpawnSpec
    let secret: string | undefined
    if (runner === 'api') {
      const key = readApiKey()
      if (!key) throw new Error('Add your OpenRouter API key in Settings to use the API runner')
      secret = key
      // Packaged app without a system node: Electron's own binary runs as Node.
      spec = resolveBin('node')
        ? spawnSpec(bin, args, { ...extraEnv, OPENROUTER_API_KEY: key })
        : { bin: process.execPath, args, env: { ...process.env, ...extraEnv, OPENROUTER_API_KEY: key, ELECTRON_RUN_AS_NODE: '1' } }
    } else {
      const cli = cliEnv(runner)
      secret = cli.secret
      spec = spawnSpec(bin, args, { ...extraEnv, ...injected.env, ...cli.env })
    }
    return summary(launch(
      { runner, mode, label: MODES[mode].label, input: input ?? null },
      [{ spec, cwd: root }],
      { format: streamFormat(runner, root), secret, onExit: injected.cleanup },
    ))
  } catch (err) {
    injected.cleanup()
    throw err
  }
}

/** Per-runner env for a CLI spawn: opencode gets its permission config and optional Zen key. */
function cliEnv(runner: CliRunner, textOnly = false, neutral = false): { env: NodeJS.ProcessEnv; secret?: string } {
  if (runner !== 'opencode') return { env: {} }
  const key = readOpencodeKey()
  const dirs = neutral ? [] : skillContext().dirs
  return { env: opencodeEnv(textOnly ? opencodeTextConfig(dirs) : opencodeConfig(dirs), key), secret: key ?? undefined }
}

/** A zen (in-process OpenCode Zen) run: career-ops file tools by default, or `browser` tools only. */
export function startZen(record: RunStart, prompt: string, opts: AgentPromptOptions & { browser?: BrowserTools } = {}): RunSummary {
  const key = readOpencodeKey()
  if (!key) throw new Error(NEEDS_ZEN_KEY)
  const root = careerOpsRoot()
  const skills = skillContext()
  const agentSkills = opts.browser ? null : prepareSkills('zen', root, opts.skills)
  const chosen = opts.model ?? readSettings().models.zen
  const note = [skills.note, agentSkills?.promptHint].filter(Boolean).join('\n\n') || null
  const blocked = imageArgs('zen', opts.images ?? [], chosen).error
  if (blocked) throw new Error(blocked)
  const job = {
    key,
    resume: opts.resume,
    images: opts.images,
    sessionDir: userFile('zen-sessions'),
    ...(opts.browser
      ? { tools: opts.browser, system: BROWSER_SYSTEM, prompt }
      : { tools: { root, readDirs: skills.dirs, env: opts.env ?? {}, ...(agentSkills?.tools ? { skills: agentSkills.tools } : {}) }, system: zenSystem(root, note), prompt: zenPrompt(root, prompt) }),
  }
  return summary(launchTask(record, async (log, run) => runZen({ ...job, model: await zenModel(chosen) }, log, run), opts.onExit))
}

/** Launch a server-built prompt (must start with a fixed literal, e.g. "/career-ops …").
 *  Needs an agent (CLI or zen); the OpenRouter API runner only implements fixed commands. */
export type AgentPromptOptions = { resume?: string; env?: NodeJS.ProcessEnv; onExit?: (run: RunRecord) => void; /** Answer from the prompt alone: no file/shell tools (see PromptOptions.textOnly). */ textOnly?: boolean; /** With textOnly on claude/opencode: run in an empty folder with no skills, so no project instructions or skill lists inflate the request (8.7k vs 25k input tokens measured on opencode). */ neutral?: boolean; /** Model for this run only (helper-tier calls); unset = the runner's configured model. */ model?: string; /** The job this run is about. */ jobId?: string; /** Images attached to the message (stored by attachments.ts). */ images?: Attachment[]; /** Skill ids picked for this run only; overrides the default enabled set. */ skills?: string[] }

export function startAgentPrompt(label: string, mode: string, prompt: string, input: string | null = null, opts: AgentPromptOptions = {}): RunSummary {
  const { runner } = readSettings()
  if (runner === 'api') throw new Error(`"${label}" needs an agent (Claude Code, Codex, Antigravity, OpenCode or OpenCode Zen) — switch runner in Settings`)
  if (/^\s*-/.test(prompt)) throw new Error('Prompt must start with a fixed literal, not a flag')
  if (runner === 'zen') return startZen({ runner, mode, label, input, jobId: opts.jobId }, prompt, opts)
  const root = careerOpsRoot()
  // A text-only run has no file tools, so it gets no skills either.
  const injected: PreparedSkills | null = opts.textOnly ? null : prepareSkills(runner, root, opts.skills)
  try {
    // claude (--resume), agy (--conversation) and opencode (--session) continue sessions; codex starts fresh each message.
    const base = promptOptions({ ...(runner === 'codex' ? {} : { resume: opts.resume }), ...(opts.model ? { model: opts.model } : {}), ...(injected?.promptHint ? { skillsHint: injected.promptHint } : {}) })
    // A text-only run needs neither the installed-skill folders nor their system-prompt note.
    const img = imageArgs(runner, opts.images ?? [], base.model)
    if (img.error) throw new Error(img.error)
    const withImages = { ...base, addDirs: [...(base.addDirs ?? []), ...img.addDirs], imageFlags: img.flags }
    const { bin, args } = argsForPrompt(runner, prompt + img.note, opts.textOnly ? { ...withImages, addDirs: [], systemAppend: undefined, textOnly: true } : withImages)
    const neutral = opts.neutral === true && opts.textOnly === true && (runner === 'opencode' || runner === 'claude')
    const cli = cliEnv(runner, opts.textOnly, neutral)
    let cwd = root
    if (neutral) { cwd = userFile('text-runs'); fs.mkdirSync(cwd, { recursive: true }) }
    return summary(launch({ runner, mode, label, input, jobId: opts.jobId }, [{ spec: spawnSpec(bin, args, { ...opts.env, ...injected?.env, ...cli.env }), cwd }], { format: streamFormat(runner, root), onExit: run => { injected?.cleanup(); opts.onExit?.(run) }, secret: cli.secret }))
  } catch (err) {
    injected?.cleanup()
    throw err
  }
}
