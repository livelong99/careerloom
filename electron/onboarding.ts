// First-run setup: are Node/npm/git installed, and put career-ops in ~/Documents.
// Registered by main.ts via FEATURES; UI in renderer/sections/Onboarding.tsx.
import { app } from 'electron'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'

import { checkRoot } from './careerops'
import { broadcast, launch, summary, writeSettings, type Handler } from './context'
import type { DirState, Prerequisites, ToolCheck } from './contract'
import { resolveBin, spawnSpec } from './runner'

const CAREER_OPS_REPO = 'https://github.com/career-ops-hq/career-ops.git'
export const MIN_NODE_MAJOR = 18

// ————— Pure helpers (tested) —————

export function parseVersion(out: string): string | null {
  return /v?(\d+\.\d+(?:\.\d+)?)/.exec(out)?.[1] ?? null
}

export const nodeVersionOk = (version: string | null) => version !== null && Number(version.split('.')[0]) >= MIN_NODE_MAJOR

/** What's at the target folder: nothing, an empty folder, a career-ops checkout, or other files. */
export function dirState(dir: string): DirState {
  if (!fs.existsSync(dir)) return 'missing'
  if (checkRoot(dir).ok) return 'valid'
  try { return fs.readdirSync(dir).length ? 'occupied' : 'empty' } catch { return 'occupied' }
}

// ————— Probes —————

function probe(name: string): Promise<ToolCheck> {
  const bin = resolveBin(name)
  if (!bin) return Promise.resolve({ path: null, version: null, ok: false })
  const spec = spawnSpec(name, ['--version'])
  return new Promise(resolve => {
    execFile(spec.bin, spec.args, { env: spec.env, timeout: 10_000, windowsHide: true, windowsVerbatimArguments: spec.verbatim }, (err, stdout) => {
      const version = err ? null : parseVersion(stdout)
      resolve({ path: bin, version, ok: version !== null })
    })
  })
}

const defaultDir = () => path.join(app.getPath('documents'), 'career-ops')

function adopt(root: string): void {
  writeSettings({ root })
  broadcast('careerloom:settings', null)
}

export const onboardingHandlers: Record<string, Handler> = {
  prerequisites: async (): Promise<Prerequisites> => {
    const [node, npm, git] = await Promise.all([probe('node'), probe('npm'), probe('git')])
    const dir = defaultDir()
    return { node: { ...node, ok: nodeVersionOk(node.version) }, npm, git, platform: process.platform, defaultCareerOpsDir: dir, defaultDirState: dirState(dir) }
  },
  installCareerOpsDefault: () => {
    const dir = defaultDir()
    const state = dirState(dir)
    if (state === 'valid') { adopt(dir); return { run: null, root: dir } }
    if (state === 'occupied') throw new Error(`${dir} already has other files in it. Move them, or choose an existing career-ops folder instead.`)
    fs.mkdirSync(path.dirname(dir), { recursive: true })
    const run = launch(
      { runner: 'setup', mode: 'setup', label: 'Set up career-ops', input: dir },
      [
        { spec: spawnSpec('git', ['clone', '--depth', '1', CAREER_OPS_REPO, dir]), cwd: path.dirname(dir) },
        { spec: spawnSpec('npm', ['install', '--no-audit', '--no-fund']), cwd: dir },
      ],
      { onSuccess: () => adopt(dir) },
    )
    return { run: summary(run), root: dir }
  },
}
