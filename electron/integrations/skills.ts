// Skills: career-ops itself (bundled, id 'skill:career-ops') plus any GitHub
// skill repos the user adds (cloned into userData/skills/<owner>__<repo>).
import fs from 'node:fs'
import path from 'node:path'

import { checkRoot } from '../careerops'
import { inside, launch, readSettings, summary, type RunSummary } from '../context'
import { spawnSpec } from '../runner'
import { detectEntrypoints, ghReachable, parseGithubUrl } from './github'
import { readRegistry, userSkillsDir, writeRegistry, type SkillEntry } from './registry'
import type { HealthCheck, Integration, IntegrationDetail, InstallPreview } from '../contract'

function careerOpsSkill(): Integration & { path: string | null } {
  const { root } = readSettings()
  const check = root ? checkRoot(root) : null
  const ok = check?.ok === true
  return {
    id: 'skill:career-ops', kind: 'skill', name: 'career-ops', summary: 'The job-search agent this app drives',
    status: ok ? 'ready' : 'needs_setup', statusText: ok ? 'Installed' : (check && !check.ok ? check.reason : 'Pick your career-ops folder in Settings'),
    installedBy: 'app', source: 'https://github.com/career-ops-hq/career-ops', actions: ok ? ['check', 'update'] : ['check'],
    path: ok ? root : null,
  }
}

function userSkillDetail(entry: SkillEntry): IntegrationDetail {
  const found = fs.existsSync(entry.path) ? detectEntrypoints(entry.path) : []
  const checks: HealthCheck[] = [
    { label: 'Cloned locally', ok: fs.existsSync(entry.path) },
    { label: 'Has a skill entrypoint', ok: found.length > 0, detail: found.map(f => f.rel).join(', ') || undefined },
  ]
  const status = !fs.existsSync(entry.path) ? 'error' : !entry.enabled ? 'off' : found.length > 0 ? 'ready' : 'needs_setup'
  return {
    id: `skill:${entry.id}`, kind: 'skill', name: entry.name, summary: entry.description ?? entry.repo,
    status, statusText: !fs.existsSync(entry.path) ? 'Missing on disk' : !entry.enabled ? 'Disabled' : found.length > 0 ? 'Ready' : 'No SKILL.md/AGENTS.md found',
    installedBy: 'user', source: entry.repo, actions: entry.enabled ? ['update', 'disable', 'remove', 'check'] : ['enable', 'remove', 'check'],
    checks, config: [], logTail: [], path: entry.path,
  }
}

export function listSkills(): Integration[] {
  const { skills } = readRegistry()
  return [careerOpsSkill(), ...skills.map(s => userSkillDetail(s))]
}

export function getSkillDetail(id: string): IntegrationDetail {
  if (id === 'skill:career-ops') {
    const base = careerOpsSkill()
    const depsInstalled = base.path !== null && fs.existsSync(path.join(base.path, 'node_modules'))
    const checks: HealthCheck[] = [
      { label: 'career-ops root configured', ok: base.status === 'ready' },
      { label: 'Dependencies installed', ok: depsInstalled, optional: base.status !== 'ready' },
    ]
    const actions = base.status === 'ready' && !depsInstalled ? [...base.actions, 'install' as const] : base.actions
    return { ...base, actions, checks, config: [], logTail: [], path: base.path }
  }
  const entryId = id.replace(/^skill:/, '')
  const entry = readRegistry().skills.find(s => s.id === entryId)
  if (!entry) throw new Error(`Unknown skill "${id}"`)
  return userSkillDetail(entry)
}

export function previewSkillInstall(url: string): InstallPreview {
  const parsed = parseGithubUrl(url)
  if (!parsed) return { kind: 'skill', name: url, plan: '', warnings: [], refusal: 'Only github.com/<owner>/<repo> URLs are accepted for skills' }
  const dirName = `${parsed.owner}__${parsed.repo}`
  const exists = readRegistry().skills.some(s => s.id === dirName)
  if (exists) return { kind: 'skill', name: parsed.repo, plan: '', warnings: [], refusal: `${parsed.repo} is already added` }
  return { kind: 'skill', name: parsed.repo, plan: `Clone ${parsed.owner}/${parsed.repo} into your skills folder and detect its entrypoint`, warnings: [], refusal: null }
}

export async function installSkill(url: string): Promise<RunSummary> {
  const parsed = parseGithubUrl(url)
  if (!parsed) throw new Error('Only github.com/<owner>/<repo> URLs are accepted for skills')
  const dirName = `${parsed.owner}__${parsed.repo}`
  if (readRegistry().skills.some(s => s.id === dirName)) throw new Error(`${parsed.repo} is already added`)
  const reachable = await ghReachable(parsed.cloneUrl)
  if (!reachable) throw new Error(`Could not reach ${parsed.cloneUrl} — check the URL and your network`)
  const target = path.join(userSkillsDir(), dirName)
  // cwd must exist before the child process spawns (launch() starts it synchronously).
  fs.mkdirSync(userSkillsDir(), { recursive: true })
  const run = launch(
    { runner: 'script', mode: 'skill-install', label: `Add skill: ${parsed.repo}`, input: url },
    [{ spec: spawnSpec('git', ['clone', '--depth', '1', parsed.cloneUrl, target]), cwd: userSkillsDir() }],
    {
      onSuccess: () => {
        const found = detectEntrypoints(target)
        const entry: SkillEntry = {
          id: dirName, name: parsed.repo, description: found[0]?.description ?? null,
          repo: parsed.cloneUrl, path: target, installedAt: Date.now(), enabled: true,
        }
        writeRegistry({ skills: [...readRegistry().skills.filter(s => s.id !== dirName), entry] })
      },
    },
  )
  return summary(run)
}

function requireUserSkill(id: string): SkillEntry {
  const entryId = id.replace(/^skill:/, '')
  const entry = readRegistry().skills.find(s => s.id === entryId)
  if (!entry) throw new Error(`Unknown skill "${id}"`)
  return entry
}

export function removeSkill(id: string): void {
  const entry = requireUserSkill(id)
  // Only ever deletes inside our own skills dir — never a path the registry
  // entry alone could redirect elsewhere.
  const target = inside(userSkillsDir(), path.relative(userSkillsDir(), entry.path))
  fs.rmSync(target, { recursive: true, force: true })
  writeRegistry({ skills: readRegistry().skills.filter(s => s.id !== entry.id) })
}

export function updateSkill(id: string): RunSummary {
  const entry = requireUserSkill(id)
  const run = launch(
    { runner: 'script', mode: 'skill-update', label: `Update skill: ${entry.name}`, input: null },
    [{ spec: spawnSpec('git', ['pull', '--ff-only']), cwd: entry.path }],
  )
  return summary(run)
}

export function updateCareerOps(): RunSummary {
  const { root } = readSettings()
  if (!root) throw new Error('Pick your career-ops folder in Settings first')
  const run = launch(
    { runner: 'script', mode: 'skill-update', label: 'Update career-ops', input: null },
    [{ spec: spawnSpec('git', ['pull', '--ff-only']), cwd: root }],
  )
  return summary(run)
}

/** "Repair" for career-ops: `npm install` when node_modules is missing/stale. */
export function repairCareerOps(): RunSummary {
  const { root } = readSettings()
  if (!root) throw new Error('Pick your career-ops folder in Settings first')
  const run = launch(
    { runner: 'script', mode: 'skill-repair', label: 'Install career-ops dependencies', input: null },
    [{ spec: spawnSpec('npm', ['install', '--no-audit', '--no-fund']), cwd: root }],
  )
  return summary(run)
}

export function setSkillEnabled(id: string, enabled: boolean): void {
  const entry = requireUserSkill(id)
  writeRegistry({ skills: readRegistry().skills.map(s => (s.id === entry.id ? { ...s, enabled } : s)) })
}
