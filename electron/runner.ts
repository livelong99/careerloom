import { spawn, type ChildProcess } from 'node:child_process'
import { accessSync, constants, readdirSync, statSync } from 'node:fs'
import { homedir, platform } from 'node:os'
import { delimiter, dirname, join } from 'node:path'

import { runtimeBinDirs } from './runtime/paths'

/** Who does the work. CLI runners use the user's own subscription; `api` runs
 *  career-ops' OpenRouter runner with an API key; `zen` is Careerloom's own agent loop
 *  on the OpenCode Zen API (zen-agent.ts) — free models need no key. */
export type RunnerId = 'claude' | 'codex' | 'antigravity' | 'opencode' | 'zen' | 'api'
export const RUNNERS: RunnerId[] = ['claude', 'codex', 'antigravity', 'opencode', 'zen', 'api']
/** Runners that spawn an agent CLI. */
export type CliRunner = Exclude<RunnerId, 'api' | 'zen'>

/** career-ops modes the UI can launch. `apiCommand` marks the ones the
 *  key-based OpenRouter runner also implements; the rest need an agent CLI. */
export const MODES = {
  evaluate: { label: 'Evaluate a job', input: 'url', apiCommand: 'evaluate' },
  scan: { label: 'Scan portals', input: null, apiCommand: 'scan' },
  pipeline: { label: 'Process inbox', input: null, apiCommand: 'pipeline' },
  apply: { label: 'Draft application', input: 'report', apiCommand: 'apply' },
  pdf: { label: 'Tailored CV (PDF)', input: 'report', apiCommand: null },
  cover: { label: 'Cover letter', input: 'report', apiCommand: null },
  'interview-prep': { label: 'Interview prep', input: 'report', apiCommand: null },
  deep: { label: 'Company deep-dive', input: 'text', apiCommand: null },
  contacto: { label: 'LinkedIn outreach', input: 'report', apiCommand: null },
  followup: { label: 'Follow-ups due', input: null, apiCommand: null },
  patterns: { label: 'Rejection patterns', input: null, apiCommand: null },
  upskill: { label: 'Skill gaps', input: null, apiCommand: null },
  titles: { label: 'Adjacent titles', input: null, apiCommand: null },
  interview: { label: 'Build my profile', input: null, apiCommand: null },
  intake: { label: 'Parse my resume', input: null, apiCommand: null },
  ats: { label: 'ATS check vs a job', input: 'url', apiCommand: null },
} as const
export type ModeId = keyof typeof MODES

export type RunRequest = { runner: RunnerId; mode: ModeId; input?: string }
export type SpawnSpec = { bin: string; args: string[]; env: NodeJS.ProcessEnv; verbatim?: true }

const BINS: Record<CliRunner, string> = { claude: 'claude', codex: 'codex', antigravity: 'agy', opencode: 'opencode' }

// Headless claude may edit files and run career-ops' own node scripts, nothing
// broader. ponytail: fixed allowlist; make it a setting if users need MCP tools.
const CLAUDE_TOOLS = ['Read', 'Write', 'Edit', 'Glob', 'Grep', 'WebFetch', 'WebSearch', 'Bash(node:*)', 'Bash(npm run:*)']

export function isRunner(v: unknown): v is RunnerId {
  return typeof v === 'string' && (RUNNERS as string[]).includes(v)
}

export function isMode(v: unknown): v is ModeId {
  return typeof v === 'string' && Object.hasOwn(MODES, v)
}

/** Validates renderer input (trust boundary) and builds the agent prompt. */
export function promptFor(mode: ModeId, input: string | undefined): string {
  const kind = MODES[mode].input
  const arg = (input ?? '').trim()
  if (kind && !arg) throw new Error(`${MODES[mode].label} needs an input`)
  if (arg.length > 20_000) throw new Error('Input is too long')
  if (kind === 'url' && /^https?:\/\//i.test(arg)) new URL(arg) // throws on malformed
  if (kind === 'report' && !/^\d{1,5}$/.test(arg)) throw new Error('Report number must be digits')
  // A pasted JD (no URL) is routed to auto-pipeline, same as the career-ops router.
  const body = mode === 'evaluate' ? arg : `${mode}${arg ? ` ${arg}` : ''}`
  return `/career-ops ${body}`
}

/** argv for one run. Pure, so it is tested without spawning. */
export function argsFor(req: RunRequest, opts: PromptOptions = {}): { bin: string; args: string[] } {
  if (req.runner === 'zen') throw new Error('The Zen runner runs in-process (zen-agent.ts), not as a CLI')
  if (req.runner === 'api') {
    const command = MODES[req.mode].apiCommand
    if (!command) throw new Error(`"${MODES[req.mode].label}" needs Claude Code, Codex or Antigravity — the API runner only does evaluate, scan, pipeline and apply`)
    promptFor(req.mode, req.input) // same input validation as the CLI runners
    const arg = (req.input ?? '').trim()
    return { bin: 'node', args: ['openrouter-runner.mjs', command, ...(arg ? [arg] : [])] }
  }
  return argsForPrompt(req.runner, promptFor(req.mode, req.input), opts)
}

/** argv for a server-built prompt (feature modules: resume templates, ATS vs a JD, …).
 *  The prompt starts with a fixed literal, never with user text, so it cannot read as a flag. */
export type PromptOptions = {
  /** Continue an earlier claude session (chat follow-ups). */
  resume?: string
  /** Extra folders the agent may read (installed skills). */
  addDirs?: string[]
  /** Appended to the system prompt (what skills are installed, house context). */
  systemAppend?: string
  /** CLI model id/alias (e.g. `sonnet`, `gpt-5-codex`, `gemini-3.1-pro-high`); unset = the CLI's default. */
  model?: string
  /** agy project holding Careerloom's permission grants (see agy-project.ts). */
  agyProject?: string
  /** No file or shell tools: the task is answered from the prompt alone (web search/fetch stay). */
  textOnly?: boolean
}

/** Model ids are passed as argv values; keep them to a safe charset so they can't read as flags. */
export const isModelId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9][\w.:/@-]{0,99}$/.test(v)

export function argsForPrompt(runner: CliRunner, prompt: string, opts: PromptOptions = {}): { bin: string; args: string[] } {
  switch (runner) {
    case 'claude': {
      if (opts.textOnly) {
        // `--tools` narrows the built-in set; `--allowedTools` lets those two run without a prompt. Both variadic, so last.
        return { bin: BINS.claude, args: ['-p', prompt, '--output-format', 'stream-json', '--verbose', ...(opts.resume && /^[\w-]{8,64}$/.test(opts.resume) ? ['--resume', opts.resume] : []), ...(isModelId(opts.model) ? ['--model', opts.model] : []), '--tools', 'WebSearch,WebFetch', '--allowedTools', 'WebSearch', 'WebFetch'] }
      }
      const extra = [
        ...(opts.resume && /^[\w-]{8,64}$/.test(opts.resume) ? ['--resume', opts.resume] : []),
        ...(opts.addDirs?.length ? ['--add-dir', ...opts.addDirs] : []),
        ...(opts.systemAppend ? ['--append-system-prompt', opts.systemAppend] : []),
        ...(isModelId(opts.model) ? ['--model', opts.model] : []),
      ]
      // `--allowedTools` is variadic, so everything after it must be a tool name — keep it last.
      return { bin: BINS.claude, args: ['-p', prompt, '--output-format', 'stream-json', '--verbose', '--permission-mode', 'acceptEdits', ...extra, '--allowedTools', ...CLAUDE_TOOLS] }
    }
    case 'codex':
      // Codex has no slash-skill routing in exec mode; career-ops documents plain text.
      return { bin: BINS.codex, args: ['exec', '--sandbox', opts.textOnly ? 'read-only' : 'workspace-write', ...(isModelId(opts.model) ? ['--model', opts.model] : []), `Run the career-ops router for: ${prompt.replace(/^\/career-ops /, '')}. Follow AGENTS.md.`] }
    case 'antigravity':
      // agy's --add-dir is repeatable (one dir per flag); it has no system-prompt flag.
      return {
        bin: BINS.antigravity,
        args: [
          '-p', prompt,
          // Headless agy can't ask for permission, and its agent works through shell commands
          // (git, find, grep…) that a prefix allowlist can't cover safely. So it runs in agy's
          // OS sandbox — any command, but writes only inside the workspace (verified: writes to
          // $HOME are refused) — with prompts auto-approved, in Careerloom's granted project.
          ...(opts.agyProject && /^[A-Za-z0-9][\w-]{0,63}$/.test(opts.agyProject)
            ? ['--project', opts.agyProject, '--mode', 'accept-edits', '--sandbox', '--dangerously-skip-permissions']
            : []),
          '--output-format', 'stream-json',
          // Chat follow-ups continue the same agy conversation.
          ...(opts.resume && /^[\w-]{8,64}$/.test(opts.resume) ? ['--conversation', opts.resume] : []),
          ...(isModelId(opts.model) ? ['--model', opts.model] : []),
          ...(opts.addDirs ?? []).flatMap(d => ['--add-dir', d]),
        ],
      }
    case 'opencode': {
      // career-ops ships .opencode/commands/career-ops.md; other prompts go in as plain messages.
      // Permissions come from OPENCODE_CONFIG_CONTENT (opencode.ts), never --auto.
      const cmd = /^\/career-ops\s+([\s\S]+)$/.exec(prompt)
      return {
        bin: BINS.opencode,
        args: [
          'run', '--format', 'json',
          ...(cmd ? ['--command', 'career-ops'] : []),
          ...(opts.resume && /^[\w-]{8,64}$/.test(opts.resume) ? ['--session', opts.resume] : []),
          ...(isModelId(opts.model) ? ['--model', opts.model] : []),
          cmd ? cmd[1]! : prompt,
        ],
      }
    }
  }
}

// ————— PATH resolution (from codeburn's cli.ts): a GUI-launched app inherits a
// minimal PATH that lacks Homebrew, nvm and ~/.local/bin, where these CLIs live.

function isExecutable(p: string): boolean {
  try { return statSync(p).isFile() && (accessSync(p, constants.X_OK), true) } catch { return false }
}

function searchDirs(): string[] {
  const home = homedir()
  const dirs = [
    ...runtimeBinDirs(), // Careerloom's own node/python/git/npm CLIs win over whatever the system has
    ...(process.env.PATH || '').split(delimiter),
    '/opt/homebrew/bin', '/usr/local/bin',
    join(home, '.local', 'bin'), join(home, '.claude', 'local'),
    join(home, '.volta', 'bin'), join(home, '.npm-global', 'bin'), join(home, '.asdf', 'shims'),
  ]
  const nvm = join(process.env.NVM_DIR || join(home, '.nvm'), 'versions', 'node')
  try { for (const v of readdirSync(nvm).sort().reverse()) dirs.push(join(nvm, v, 'bin')) } catch { /* no nvm */ }
  return [...new Set(dirs.filter(Boolean))]
}

/** Absolute path of `name`, or null. Windows looks for the npm `.cmd` shim too. */
export function resolveBin(name: string): string | null {
  const names = platform() === 'win32' ? [`${name}.cmd`, `${name}.exe`, name] : [name]
  for (const dir of searchDirs()) for (const n of names) if (isExecutable(join(dir, n))) return join(dir, n)
  return null
}

// Quote one argument for `cmd.exe /c` (from codeburn's cli.ts, the cross-spawn
// rule): a .cmd shim re-expands its arguments, so meta characters are escaped
// twice. Prompts carry pasted job descriptions, so this is a trust boundary.
const CMD_META = /([()\][%!^"`<>&|;, *?])/g
export function escapeForCmd(arg: string, doubleEscape: boolean): string {
  let escaped = arg.replace(/(\\*)"/g, '$1$1\\"').replace(/(\\*)$/, '$1$1')
  escaped = `"${escaped}"`.replace(CMD_META, '^$1')
  return doubleEscape ? escaped.replace(CMD_META, '^$1') : escaped
}

export function spawnSpec(bin: string, args: string[], extraEnv: NodeJS.ProcessEnv = {}): SpawnSpec {
  const resolved = resolveBin(bin)
  if (!resolved) throw new Error(`${bin} not found on PATH — install it or pick another runner in Settings`)
  const path = [dirname(resolved), ...searchDirs()].join(delimiter)
  const env = { ...process.env, ...extraEnv, PATH: path }
  if (platform() === 'win32' && /\.(cmd|bat)$/i.test(resolved)) {
    const line = [escapeForCmd(resolved, false), ...args.map(a => escapeForCmd(a, true))].join(' ')
    const cmd = join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'cmd.exe')
    return { bin: cmd, args: ['/d', '/s', '/c', `"${line}"`], env, verbatim: true }
  }
  return { bin: resolved, args, env }
}

// ————— Process lifecycle —————

const active = new Map<string, ChildProcess>()
const ownsGroup = platform() !== 'win32'

function killTree(child: ChildProcess): void {
  if (ownsGroup && child.pid) {
    try { process.kill(-child.pid, 'SIGTERM'); return } catch { /* group gone */ }
  }
  if (!ownsGroup && child.pid) {
    // Windows: a .cmd shim spawns node as its own child; only taskkill /T reaches it.
    spawn(join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'taskkill.exe'), ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
    return
  }
  try { child.kill('SIGTERM') } catch { /* already gone */ }
}

export type RunEvents = { onChunk: (stream: 'out' | 'err', text: string) => void; onExit: (code: number | null) => void }

/** Start a run; returns immediately. Output streams through `events`. */
export function startRun(id: string, spec: SpawnSpec, cwd: string, events: RunEvents): void {
  const child = spawn(spec.bin, spec.args, {
    cwd,
    // spawn doesn't update the inherited PWD, and some CLIs (opencode run) trust PWD over the real cwd.
    env: { ...spec.env, PWD: cwd },
    detached: ownsGroup,
    stdio: ['ignore', 'pipe', 'pipe'],
    shell: false,
    ...(spec.verbatim ? { windowsVerbatimArguments: true } : {}),
    windowsHide: true,
  })
  active.set(id, child)
  child.stdout?.setEncoding('utf8').on('data', (t: string) => events.onChunk('out', t))
  child.stderr?.setEncoding('utf8').on('data', (t: string) => events.onChunk('err', t))
  child.on('error', err => events.onChunk('err', `${err.message}\n`))
  child.on('close', code => { active.delete(id); events.onExit(code) })
}

export function cancelRun(id: string): boolean {
  const child = active.get(id)
  if (!child) return false
  killTree(child)
  return true
}

export function cancelAll(): void {
  for (const child of active.values()) killTree(child)
  active.clear()
}

/** One line of claude's `--output-format stream-json` → readable log text, or
 *  null for events the log does not show. Non-JSON lines pass through as-is. */
export function formatClaudeLine(line: string): string | null {
  if (!line.trim()) return null
  let ev: { type?: string; subtype?: string; message?: { content?: Array<{ type: string; text?: string; name?: string; input?: Record<string, unknown> }> }; result?: string; total_cost_usd?: number }
  try { ev = JSON.parse(line) } catch { return line }
  if (ev.type === 'assistant') {
    return (ev.message?.content ?? []).map(c => {
      if (c.type === 'text') return c.text ?? ''
      if (c.type === 'tool_use') {
        const hint = c.input?.command ?? c.input?.file_path ?? c.input?.url ?? c.input?.pattern ?? ''
        return `▸ ${c.name}${hint ? ` ${String(hint).slice(0, 160)}` : ''}`
      }
      return ''
    }).filter(Boolean).join('\n') || null
  }
  if (ev.type === 'result') return `\n✓ done${typeof ev.total_cost_usd === 'number' ? ` · $${ev.total_cost_usd.toFixed(3)}` : ''}`
  return null
}

/** Cost/token usage from claude's final stream-json `result` event, else null. */
export type RunUsage = { costUsd: number | null; inputTokens: number; outputTokens: number; turns: number | null; durationMs: number | null }
export function claudeUsage(line: string): RunUsage | null {
  if (!line.includes('"result"')) return null
  try {
    const ev = JSON.parse(line) as { type?: string; total_cost_usd?: number; num_turns?: number; duration_ms?: number; usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number } }
    if (ev.type !== 'result') return null
    const u = ev.usage ?? {}
    return {
      costUsd: typeof ev.total_cost_usd === 'number' ? ev.total_cost_usd : null,
      inputTokens: (u.input_tokens ?? 0) + (u.cache_read_input_tokens ?? 0) + (u.cache_creation_input_tokens ?? 0),
      outputTokens: u.output_tokens ?? 0,
      turns: ev.num_turns ?? null,
      durationMs: ev.duration_ms ?? null,
    }
  } catch {
    return null
  }
}

/** The session id from claude's first stream-json event (`system`/`init`), else null. */
export function claudeSessionId(line: string): string | null {
  if (!line.includes('"session_id"')) return null
  try {
    const ev = JSON.parse(line) as { type?: string; session_id?: unknown }
    return ev.type === 'system' && typeof ev.session_id === 'string' ? ev.session_id : null
  } catch {
    return null
  }
}

// ————— Antigravity (`agy --output-format stream-json`) —————
type AgyEvent = {
  event?: string
  conversation_id?: string
  step_update?: { state?: string; step_type?: string; tool_name?: string; text_delta?: string; tool_info?: { parameters?: Record<string, unknown> } }
  result?: { status?: string; duration_seconds?: number; num_turns?: number; usage?: { input_tokens?: number; output_tokens?: number; thinking_tokens?: number; cache_read_tokens?: number } }
}

const parseAgy = (line: string): AgyEvent | null => {
  if (!line.startsWith('{')) return null
  try { return JSON.parse(line) as AgyEvent } catch { return null }
}

const compact = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 10_000 ? 0 : 1)}K` : String(n))

/** Stateful formatter for one agy run: streams text deltas as-is and puts each tool step on
 *  its own line. Returns text to append verbatim (it carries its own newlines), or null. */
export function agyFormatter(): (line: string) => string | null {
  let midLine = false // the last output was a text delta without a trailing newline
  const newline = () => (midLine ? ((midLine = false), '\n') : '')
  return line => {
    if (!line.trim()) return null
    const ev = parseAgy(line)
    if (!ev) return `${newline()}${line}\n` // plain text (warnings, errors) passes through
    const step = ev.step_update
    if (ev.event === 'step_update' && step?.step_type === 'agent_response' && step.text_delta) {
      midLine = !step.text_delta.endsWith('\n')
      return step.text_delta
    }
    if (ev.event === 'step_update' && step?.step_type === 'tool' && step.state === 'ACTIVE' && step.tool_name) {
      const p = step.tool_info?.parameters ?? {}
      const hint = p.CommandLine ?? p.AbsolutePath ?? p.Url ?? p.Query ?? p.SearchPath ?? p.Pattern ?? ''
      return `${newline()}▸ ${step.tool_name}${hint ? ` ${String(hint).slice(0, 160)}` : ''}\n`
    }
    if (ev.event === 'result' && ev.result) {
      const u = ev.result.usage
      const tokens = u ? (u.input_tokens ?? 0) + (u.output_tokens ?? 0) : 0
      const secs = ev.result.duration_seconds
      const ok = ev.result.status === 'SUCCESS'
      const bits = [tokens ? `${compact(tokens)} tokens` : '', secs ? `${Math.round(secs)}s` : ''].filter(Boolean).join(' · ')
      return `${newline()}\n${ok ? '✓ done' : `✗ ${ev.result.status?.toLowerCase() ?? 'failed'}`}${bits ? ` · ${bits}` : ''}\n`
    }
    return null
  }
}

/** Conversation id from agy's `init` event (resume with `--conversation`). */
export function agySessionId(line: string): string | null {
  const ev = line.includes('"init"') ? parseAgy(line) : null
  return ev?.event === 'init' && typeof ev.conversation_id === 'string' ? ev.conversation_id : null
}

/** Usage from agy's final `result` event (no $ cost — agy bills in credits). */
export function agyUsage(line: string): RunUsage | null {
  const ev = line.includes('"result"') ? parseAgy(line) : null
  if (ev?.event !== 'result' || !ev.result) return null
  const u = ev.result.usage ?? {}
  return {
    costUsd: null,
    inputTokens: (u.input_tokens ?? 0) + (u.cache_read_tokens ?? 0),
    outputTokens: (u.output_tokens ?? 0) + (u.thinking_tokens ?? 0),
    turns: ev.result.num_turns ?? null,
    durationMs: typeof ev.result.duration_seconds === 'number' ? Math.round(ev.result.duration_seconds * 1000) : null,
  }
}

/** agy's final status: false when the result event reports anything but SUCCESS. */
export function agyResultOk(line: string): boolean | null {
  const ev = line.includes('"result"') ? parseAgy(line) : null
  return ev?.event === 'result' ? ev.result?.status === 'SUCCESS' : null
}

// ————— opencode (`opencode run --format json`) —————
// One JSON object per line: {type, sessionID, part|error}. `text` and `tool_use` arrive complete;
// each `step_finish` carries that step's cost + tokens; there is no final result event.
type OpencodeEvent = {
  type?: string
  sessionID?: string
  part?: { text?: string; tool?: string; state?: { status?: string; input?: Record<string, unknown>; title?: string }; cost?: number; tokens?: { input?: number; output?: number; reasoning?: number; cache?: { read?: number; write?: number } } }
  error?: { name?: string; data?: { message?: string } }
}
const parseOpencode = (line: string): OpencodeEvent | null => {
  if (!line.startsWith('{')) return null
  try { return JSON.parse(line) as OpencodeEvent } catch { return null }
}

/** Zen refuses anonymous free-tier use from headless runs; a key (free models stay $0) fixes it. */
const opencodeHint = (msg: string) => (/free tier/i.test(msg) ? `${msg} — Zen serves free models only to requests carrying OpenCode's standard tools; update Careerloom, or pick a paid model with an OpenCode Zen key` : msg)

export function formatOpencodeLine(line: string): string | null {
  if (!line.trim()) return null
  const ev = parseOpencode(line)
  if (!ev) return `${opencodeHint(line)}\n`
  if (ev.type === 'text' && ev.part?.text) return `${ev.part.text}\n`
  if (ev.type === 'tool_use' && ev.part?.tool) {
    const p = ev.part.state?.input ?? {}
    const hint = p.command ?? p.filePath ?? p.url ?? p.pattern ?? p.path ?? ''
    return `▸ ${ev.part.tool}${hint ? ` ${String(hint).slice(0, 160)}` : ''}${ev.part.state?.status === 'error' ? ' (failed)' : ''}\n`
  }
  if (ev.type === 'error') return `✗ ${opencodeHint(ev.error?.data?.message ?? ev.error?.name ?? 'error')}\n`
  return null
}

export function opencodeSessionId(line: string): string | null {
  const ev = line.includes('"sessionID"') ? parseOpencode(line) : null
  return typeof ev?.sessionID === 'string' && /^[\w-]{8,64}$/.test(ev.sessionID) ? ev.sessionID : null
}

/** Running total: adds this `step_finish` to `prev`; null for any other line. */
export function opencodeUsage(line: string, prev: RunUsage | null): RunUsage | null {
  const ev = line.includes('"step_finish"') ? parseOpencode(line) : null
  if (ev?.type !== 'step_finish' || !ev.part) return null
  const t = ev.part.tokens ?? {}
  return {
    costUsd: (prev?.costUsd ?? 0) + (typeof ev.part.cost === 'number' ? ev.part.cost : 0),
    inputTokens: (prev?.inputTokens ?? 0) + (t.input ?? 0) + (t.cache?.read ?? 0),
    outputTokens: (prev?.outputTokens ?? 0) + (t.output ?? 0) + (t.reasoning ?? 0),
    turns: (prev?.turns ?? 0) + 1,
    durationMs: null,
  }
}

/** An `error` event fails the run even though opencode exits 0. */
export const opencodeResultOk = (line: string): boolean | null => (line.includes('"error"') && parseOpencode(line)?.type === 'error' ? false : null)
