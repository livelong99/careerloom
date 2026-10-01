// First-launch bootstrap: installs node, python, git, career-ops, opencode (core), then the local
// model + speech model (non-core). Every step is idempotent: a cheap check() skips it when satisfied.
// Failures never throw to the UI; they become a BootstrapFailure with a paste-into-any-agent prompt.
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { checkRoot } from '../careerops'
import { broadcast, launchTask, readSettings, runs, userFile, type Handler, type RunRecord } from '../context'
import type { BootstrapFailure, BootstrapState, BootstrapStatus, BootstrapStep, BootstrapStepId } from '../contract'
import { defaultEngine, defaultModel, findSttRuntime, MODEL_SIZE_MB } from '../copilot/stt/runtime'
import { installStt } from '../copilot/stt/install'
import { careerOpsReady, defaultDir, dirState, installCareerOps, nodeVersionOk, probe } from '../onboarding'
import { findPython, findRuntime, installLocalModel } from '../prescreen-model'
import { resolveBin, spawnSpec, startRun, type SpawnSpec } from '../runner'
import { buildFailurePrompt, lastLines, redact } from './failure-prompt'
import { pickAsset, readManifest } from './manifest'
import { installAsset, sweepStale } from './download'
import { npmPrefix, toolRoot, userRuntimeDir, type Tool } from './paths'

/** Thrown by a step to explain itself: `message` is shown to the user in plain language. */
export class StepError extends Error {
  constructor(message: string, readonly command: string | null = null, readonly exitCode: number | null = null) { super(message) }
}
class Skip extends Error {}

type Ctx = { log: (t: string) => void; run: RunRecord; sh: (spec: SpawnSpec, cwd: string, label?: string) => Promise<void> }
type StepDef = {
  id: BootstrapStepId; label: string; core: boolean; sizeMb: number | null
  /** Command that proves the step is satisfied (goes into the failure prompt). */
  verify: string
  check: () => Promise<boolean>
  /** Work done inside a tracked task; or `start` to hand over to an existing run (career-ops, models). */
  run?: (ctx: Ctx) => Promise<void>
  start?: () => Promise<{ id: string } | null>
  command?: string
}

const win = process.platform === 'win32'
const MANAGED_FIX = 'Check your internet connection (and any proxy or antivirus) and press Retry, or copy the help text below into an agent CLI.'

async function installManaged(tool: Tool, ctx: Ctx): Promise<void> {
  const asset = pickAsset(readManifest(), tool)
  if (!asset) throw new StepError(`There is no ${tool} download for this computer (${process.platform} ${process.arch}).`)
  try { await installAsset(asset, toolRoot(userRuntimeDir(), tool), ctx.log) } catch (e) {
    throw new StepError(`Couldn't download ${tool}: ${(e as Error).message}. ${MANAGED_FIX}`, `download ${asset.url}`)
  }
  ctx.log(`✓ ${tool} installed\n`)
}

const STEPS: StepDef[] = [
  {
    id: 'node', label: 'Node.js', core: true, sizeMb: 35, verify: 'node --version',
    check: async () => nodeVersionOk((await probe('node')).version),
    run: ctx => installManaged('node', ctx),
  },
  {
    id: 'python', label: 'Python', core: true, sizeMb: 40, verify: win ? 'python --version' : 'python3 --version',
    check: async () => !!(await findPython()).ok,
    run: ctx => installManaged('python', ctx),
  },
  {
    id: 'git', label: 'Git', core: true, sizeMb: win ? 55 : null, verify: 'git --version',
    check: async () => (await probe('git')).ok,
    run: async ctx => {
      if (pickAsset(readManifest(), 'git')) return installManaged('git', ctx)
      if (process.platform === 'darwin') {
        await ctx.sh({ bin: '/usr/bin/xcode-select', args: ['--install'], env: process.env }, os.homedir()).catch(() => undefined) // exits 1 when already requested
        throw new StepError('macOS needs to install its developer tools (this includes Git). Finish the installer window that just opened, then press Retry.', 'xcode-select --install')
      }
      throw new StepError('Git is not installed and there is no automatic download for this system. Install Git with your package manager, then press Retry.')
    },
  },
  {
    id: 'career-ops', label: 'career-ops', core: true, sizeMb: 150, verify: 'git -C ~/Documents/career-ops status',
    command: 'git clone https://github.com/career-ops-hq/career-ops.git && npm install',
    check: async () => { const root = readSettings().root; return !!root && careerOpsReady(root) },
    start: async () => {
      const current = readSettings().root
      const dir = current && checkRoot(current).ok ? current : defaultDir() // a chosen checkout missing only its deps just gets `npm install`
      if (dirState(dir) === 'occupied') throw new Skip('You already have files in Documents/career-ops. Choose your career-ops folder in setup.')
      return installCareerOps(dir).run
    },
  },
  {
    id: 'opencode', label: 'OpenCode', core: true, sizeMb: 80, verify: 'opencode --version',
    check: async () => !!resolveBin('opencode'),
    run: async ctx => {
      const prefix = npmPrefix()
      fs.mkdirSync(prefix, { recursive: true })
      await ctx.sh(spawnSpec('npm', ['install', '-g', '--prefix', prefix, '--no-audit', '--no-fund', 'opencode-ai']), prefix, `npm install -g --prefix ${prefix} opencode-ai`)
    },
  },
  {
    id: 'prescreen-model', label: 'Pre-screen model', core: false, sizeMb: 1400, verify: 'ls ~/.careerloom/model/ready.json',
    command: 'python -m venv + pip install (see log)',
    check: async () => !!findRuntime(),
    start: async () => installLocalModel(),
  },
  {
    id: 'stt', label: 'Speech model', core: false, sizeMb: MODEL_SIZE_MB[`${defaultEngine()}:${defaultModel(defaultEngine())}`] ?? null, verify: 'ls ~/.careerloom/stt/*/ready.json',
    command: 'python -m venv + pip install (see log)',
    check: async () => !!findSttRuntime(defaultEngine()),
    start: async () => { const e = defaultEngine(); return installStt(e, defaultModel(e)) },
  },
]

// ————— State —————

type Saved = Partial<Record<BootstrapStepId, Pick<BootstrapStep, 'state' | 'detail' | 'error'>>>
const stateFile = () => userFile('bootstrap.json')

function load(): Saved {
  try { return JSON.parse(fs.readFileSync(stateFile(), 'utf8')) as Saved } catch { return {} }
}

let steps: BootstrapStep[] | null = null
let running = false
let idleHook: (() => void) | null = null

/** Called whenever a bootstrap pass ends (main refreshes agent-CLI readiness here). */
export const onBootstrapIdle = (fn: () => void) => { idleHook = fn }

function ensureSteps(): BootstrapStep[] {
  if (steps) return steps
  const saved = load()
  steps = STEPS.map(d => {
    const s = saved[d.id]
    const state: BootstrapState = !s || s.state === 'running' ? 'pending' : s.state // an interrupted run resumes
    return { id: d.id, label: d.label, core: d.core, state, detail: s?.detail ?? null, sizeMb: d.sizeMb, runId: null, error: s?.error ?? null }
  })
  return steps
}

/** Pure: roll step states up into the status the UI renders. */
export function summarize(list: BootstrapStep[], isRunning: boolean): BootstrapStatus {
  const settled = (s: BootstrapStep) => s.state === 'done' || s.state === 'skipped'
  return { running: isRunning, coreDone: list.filter(s => s.core).every(settled), allDone: list.every(settled), platform: process.platform, arch: process.arch, steps: list }
}

export const bootstrapStatus = (): BootstrapStatus => summarize(ensureSteps(), running)

function emit(): void {
  const status = bootstrapStatus()
  try { fs.writeFileSync(stateFile(), JSON.stringify(Object.fromEntries(status.steps.map(s => [s.id, { state: s.state, detail: s.detail, error: s.error }])))) } catch { /* progress still shows live */ }
  broadcast('careerloom:bootstrap', status)
}

function patch(id: BootstrapStepId, change: Partial<BootstrapStep>): void {
  steps = ensureSteps().map(s => (s.id === id ? { ...s, ...change } : s))
  emit()
}

// ————— Execution —————

type Outcome = { ok: true } | { ok: false; failure: BootstrapFailure }

function failure(def: StepDef, message: string, command: string | null, exitCode: number | null, log: string): BootstrapFailure {
  const home = os.homedir()
  return {
    message,
    logTail: redact(lastLines(log), home),
    prompt: buildFailurePrompt({ stepId: def.id, label: def.label, command: command ?? def.command ?? null, exitCode, error: message, log, verify: def.verify, runtimeDir: userRuntimeDir() }),
  }
}

async function waitRun(id: string): Promise<RunRecord> {
  for (;;) {
    const r = runs.get(id)
    if (!r) throw new Error('run record vanished')
    if (r.status !== 'running') return r
    await new Promise(res => setTimeout(res, 700))
  }
}

async function execute(def: StepDef): Promise<Outcome> {
  const fail = (e: unknown, log = ''): Outcome => {
    const err = e as Error
    const se = err instanceof StepError ? err : null
    return { ok: false, failure: failure(def, err.message || 'Something went wrong.', se?.command ?? null, se?.exitCode ?? null, log) }
  }
  if (def.start) {
    let started: { id: string } | null
    try { started = await def.start() } catch (e) { if (e instanceof Skip) throw e; return fail(e) }
    if (!started) return { ok: true }
    patch(def.id, { runId: started.id })
    const rec = await waitRun(started.id)
    if (rec.status === 'done') return { ok: true }
    const lastErr = rec.log.split('\n').reverse().find(l => l.startsWith('✗')) ?? 'The install did not finish.'
    return fail(new StepError(`${lastErr.replace(/^✗\s*/, '')} ${MANAGED_FIX}`), rec.log)
  }
  let thrown: unknown = null
  let lastLog = ''
  const rec = await new Promise<RunRecord>(resolve => {
    const run = launchTask({ runner: 'setup', mode: 'setup', label: `Install ${def.label}`, input: def.id }, async (log, r) => {
      const say = (t: string) => { log(t); lastLog = t.trim().split('\n').pop() || lastLog; patch(def.id, { detail: lastLog.slice(0, 90) }) }
      const sh: Ctx['sh'] = async (spec, cwd, label) => {
        const cmd = label ?? `${path.basename(spec.bin)} ${spec.args.join(' ')}`
        say(`\n▸ ${cmd}\n`)
        const code = await new Promise<number | null>(res => startRun(r.id, spec, cwd, { onChunk: (_, t) => log(t), onExit: res }))
        if (code !== 0) throw new StepError(`${def.label} didn't install (the command exited with code ${code ?? 'signal'}). ${MANAGED_FIX}`, cmd, code)
      }
      try { await def.run!({ log: say, run: r, sh }) } catch (e) { thrown = e; throw e }
    }, resolve)
    patch(def.id, { runId: run.id })
  })
  return rec.status === 'done' ? { ok: true } : fail(thrown ?? new Error('The install was cancelled.'), rec.log)
}

async function processStep(def: StepDef): Promise<boolean> {
  const wasDone = ensureSteps().find(s => s.id === def.id)?.state === 'done'
  // A saved 'done' is re-verified quietly (no flicker); only a failed check flips it.
  if (!wasDone) patch(def.id, { state: 'running', detail: 'Checking…', error: null, runId: null })
  try {
    if (await def.check()) { if (!wasDone) patch(def.id, { state: 'done', detail: 'Already set up' }); return true }
  } catch { /* an unreadable check counts as "not installed" */ }
  patch(def.id, { state: 'running', error: null, runId: null })
  patch(def.id, { detail: 'Installing…' })
  try {
    const out = await execute(def)
    if (out.ok) { patch(def.id, { state: 'done', detail: 'Installed' }); return true }
    patch(def.id, { state: 'failed', detail: null, error: out.failure })
  } catch (e) {
    if (!(e instanceof Skip)) throw e
    patch(def.id, { state: 'skipped', detail: e.message })
    return true
  }
  return false
}

/** Core steps in order (a failure stops the rest, since later steps need earlier ones), then non-core. */
export async function runBootstrap(): Promise<void> {
  if (running || process.env.CAREERLOOM_NO_BOOTSTRAP) return
  running = true
  emit()
  try {
    sweepStale(userRuntimeDir())
    for (const def of STEPS.filter(d => d.core)) if (!(await processStep(def))) return
    for (const def of STEPS.filter(d => !d.core)) await processStep(def) // non-fatal
  } catch (err) {
    console.error('bootstrap failed unexpectedly:', err)
  } finally {
    running = false
    emit()
    try { idleHook?.() } catch (err) { console.error('bootstrap idle hook failed:', err) }
  }
}

export const bootstrapHandlers: Record<string, Handler> = {
  bootstrapStatus: () => bootstrapStatus(),
  bootstrapStart: (arg?: unknown) => {
    const retry = (arg as { retry?: unknown } | undefined)?.retry
    if (retry !== undefined && !STEPS.some(s => s.id === retry)) throw new Error(`Unknown setup step: ${String(retry)}`)
    void runBootstrap() // a pass already re-attempts every step that isn't done; Retry just starts one
    return bootstrapStatus()
  },
}

