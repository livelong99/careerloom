// Is each agent CLI ready to drive career-ops in this folder? Token-free probes only:
// install + version, sign-in status, the career-ops skill each CLI loads, and the
// headless setup Careerloom needs (agy permission project, codex git workspace).
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { ensureAgyProject } from './agy-project'
import type { CliCheck, Readiness } from './contract'
import { resolveBin, spawnSpec, type SpawnSpec } from './runner'

export type CliId = CliCheck['id']
export type { CliCheck, Readiness }

const BIN: Record<CliId, string> = { claude: 'claude', codex: 'codex', antigravity: 'agy', opencode: 'opencode' }
const LABEL: Record<CliId, string> = { claude: 'Claude Code', codex: 'Codex', antigravity: 'Antigravity', opencode: 'OpenCode' }
/** Where each CLI discovers the career-ops skill inside the checkout. */
const SKILL: Record<CliId, string[]> = {
  claude: ['.claude/skills/career-ops/SKILL.md'],
  codex: ['.agents/skills/career-ops/SKILL.md', 'AGENTS.md'],
  antigravity: ['.antigravitycli/skills/career-ops/SKILL.md', '.agents/skills/career-ops/SKILL.md'],
  opencode: ['.opencode/skills/career-ops/SKILL.md', '.claude/skills/career-ops/SKILL.md'],
}
const HOW_TO_INSTALL: Record<CliId, string> = {
  claude: 'Claude Code isn\'t installed. Optional: paste "install @anthropic-ai/claude-code with npm into ~/.careerloom/runtime/npm" into any agent, or use OpenCode (installed automatically)',
  codex: 'Codex isn\'t installed. Optional: paste "install @openai/codex with npm into ~/.careerloom/runtime/npm" into any agent, or use OpenCode (installed automatically)',
  antigravity: 'Install the Antigravity CLI (agy) from antigravity.google, or use OpenCode (installed automatically)',
  opencode: 'OpenCode is installed automatically when Careerloom starts — open Setup and press Retry if it is missing',
}
const HOW_TO_SIGN_IN: Record<CliId, string> = {
  claude: 'Sign in: run `claude` in a terminal and use /login',
  codex: 'Sign in: run `codex login` in a terminal',
  antigravity: 'Sign in: run `agy` in a terminal and sign in with Google',
  opencode: 'No sign-in needed for free models; add an OpenCode Zen key in Settings for paid ones',
}

// ————— Pure parsers (tested) —————

export function parseClaudeAuth(out: string): boolean | null {
  try { return (JSON.parse(out) as { loggedIn?: unknown }).loggedIn === true } catch { return /logged in/i.test(out) ? !/not logged in/i.test(out) : null }
}
export const parseCodexLogin = (out: string): boolean | null => (/not logged in/i.test(out) ? false : /logged in/i.test(out) ? true : null)
/** `agy models` prints `id<TAB>label` rows when signed in, a sign-in notice otherwise. */
export const parseAgyModels = (out: string): boolean | null => (/not signed in|sign in/i.test(out) ? false : /^\S+\t/m.test(out) ? true : null)
export const firstLine = (out: string) => out.split('\n').map(l => l.trim()).find(Boolean) ?? null

// ————— Probes —————

function run(bin: string, args: string[], cwd: string, timeoutMs = 20_000): Promise<{ ok: boolean; out: string }> {
  return new Promise(resolve => {
    // .cmd shims (npm-installed CLIs on Windows) can't be exec'd directly (spawn EINVAL); spawnSpec wraps them in cmd.exe.
    let spec: SpawnSpec
    try { spec = spawnSpec(path.basename(bin), args) } catch { spec = { bin, args, env: process.env } }
    execFile(spec.bin, spec.args, { cwd, timeout: timeoutMs, env: spec.env, windowsHide: true, windowsVerbatimArguments: spec.verbatim }, (err, stdout, stderr) => {
      resolve({ ok: !err, out: `${stdout}\n${stderr}` })
    })
  })
}

async function checkCli(id: CliId, root: string, skillDirs: string[]): Promise<CliCheck> {
  const bin = resolveBin(BIN[id])
  const base = { id, label: LABEL[id], path: bin, skill: SKILL[id].some(rel => fs.existsSync(path.join(root, rel))) }
  if (!bin) return { ...base, version: null, signedIn: null, configured: false, ready: false, problems: [HOW_TO_INSTALL[id]] }

  const [version, auth] = await Promise.all([
    run(bin, ['--version'], root, 10_000),
    id === 'claude' ? run(bin, ['auth', 'status'], root)
      : id === 'codex' ? run(bin, ['login', 'status'], root)
        : id === 'antigravity' ? run(bin, ['models'], root)
          : run(bin, ['models', 'opencode'], root), // opencode: free Zen models need no sign-in; this proves the binary works
  ])
  const signedIn = id === 'claude' ? parseClaudeAuth(auth.out) : id === 'codex' ? parseCodexLogin(auth.out) : id === 'antigravity' ? parseAgyModels(auth.out) : null

  const problems: string[] = []
  let configured = true
  if (signedIn === false) problems.push(HOW_TO_SIGN_IN[id])
  if (!base.skill) problems.push(`The career-ops skill for ${LABEL[id]} is missing — update career-ops (Integrations → career-ops → Update)`)
  if (id === 'opencode' && !auth.ok) {
    configured = false
    problems.push(`OpenCode couldn't list its models: ${firstLine(auth.out) ?? 'no output'}`)
  }
  if (id === 'antigravity') {
    // Headless agy can't ask for permissions; make sure Careerloom's scoped project exists.
    try { ensureAgyProject(root, skillDirs) } catch (err) { configured = false; problems.push(`Couldn't write Antigravity's Careerloom project: ${(err as Error).message}`) }
  }
  if (id === 'codex' && !fs.existsSync(path.join(root, '.git'))) {
    configured = false
    problems.push('Codex only runs inside a git repository — install career-ops with git (Settings → Install career-ops)')
  }
  return { ...base, version: firstLine(version.out), signedIn, configured, ready: signedIn !== false && base.skill && configured, problems }
}

/** Check all three CLIs in parallel (a few seconds, no tokens). */
export async function checkReadiness(root: string, skillDirs: string[] = []): Promise<Readiness> {
  const clis = await Promise.all((['claude', 'codex', 'antigravity', 'opencode'] as const).map(id => checkCli(id, root, skillDirs)))
  return { root, checkedAt: Date.now(), deps: fs.existsSync(path.join(root, 'node_modules')), clis }
}

/** The runner to switch to when the chosen one isn't usable: first ready CLI, in preference order. */
export function pickReadyRunner(current: string, r: Readiness): CliId | null {
  if (current === 'api' || current === 'zen') return null // an explicit API choice is never overridden
  if (r.clis.find(c => c.id === current)?.ready) return null
  return r.clis.find(c => c.ready)?.id ?? null
}
