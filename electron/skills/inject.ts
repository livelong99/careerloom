// Gets enabled skills to a run (architecture doc §4.3). CLI runners find them as files under the run's
// working folder; zen gets an index plus list_skills / read_skill tools. Everything injected is removed when the run ends.
import fs from 'node:fs'
import path from 'node:path'

import { copySkill } from './inspect'
import type { InstalledSkill } from './types'

export type SkillRunner = 'claude' | 'codex' | 'antigravity' | 'opencode' | 'zen' | 'api'

/** In-process access for runners without a filesystem convention (zen). */
export type SkillTools = { list(): string; read(id: unknown, file?: unknown): string }

export type PreparedSkills = {
  /** Extra environment for the spawned CLI (none today; kept so runners can grow without a new hook). */
  env: NodeJS.ProcessEnv
  /** Index to append to the prompt / system prompt, or null when nothing is injected. */
  promptHint: string | null
  /** zen only. */
  tools: SkillTools | null
  ids: string[]
  /** Idempotent. Removes what this call injected. */
  cleanup: () => void
}

/** Where each CLI looks for project skills, relative to the run's working folder. */
const SKILL_DIRS: Partial<Record<SkillRunner, string>> = {
  claude: '.claude/skills',
  codex: '.codex/skills',
  antigravity: '.agent/skills',
  opencode: '.opencode/skill',
}
/** CLIs that discover skills on their own; the others also get a short index. */
const NEEDS_INDEX = new Set<SkillRunner>(['codex', 'antigravity'])
const MARKER = '.careerloom-injected'
const READ_CAP = 40_000

let provider: () => InstalledSkill[] = () => []
/** Registered once by the IPC layer so this module never imports electron. */
export function setInstalledSkills(fn: () => InstalledSkill[]): void { provider = fn }

/** Explicit `ids` (a run's own pick, enabled or not) win; otherwise every enabled skill. Unknown ids are dropped. */
export function selectSkills(installed: readonly InstalledSkill[], ids?: readonly string[]): InstalledSkill[] {
  const usable = installed.filter(s => fs.existsSync(s.path))
  return ids ? usable.filter(s => ids.includes(s.id)) : usable.filter(s => s.enabled)
}

export const skillIndex = (skills: readonly InstalledSkill[]): string => skills.map(s => `- ${s.id}: ${s.description}`).join('\n')

// Concurrent runs share a working folder: the folder is written by the first run and removed by the last.
const claims = new Map<string, number>()

function place(cwd: string, rel: string, skill: InstalledSkill): string | null {
  const dest = path.join(cwd, ...rel.split('/'), skill.id)
  const held = claims.get(dest) ?? 0
  if (held > 0) { claims.set(dest, held + 1); return dest }
  // A folder we did not write is the user's own skill: leave it alone.
  if (fs.existsSync(dest) && !fs.existsSync(path.join(dest, MARKER))) return null
  fs.rmSync(dest, { recursive: true, force: true }) // left over from a run that never cleaned up
  fs.mkdirSync(dest, { recursive: true })
  copySkill(skill.path, dest)
  fs.writeFileSync(path.join(dest, MARKER), '')
  claims.set(dest, 1)
  return dest
}

function release(dest: string): void {
  const held = (claims.get(dest) ?? 0) - 1
  if (held > 0) return void claims.set(dest, held)
  claims.delete(dest)
  fs.rmSync(dest, { recursive: true, force: true })
  // Drop the parent folders only if we were the ones filling them.
  for (let dir = path.dirname(dest), i = 0; i < 2; i++, dir = path.dirname(dir)) {
    try { fs.rmdirSync(dir) } catch { break }
  }
}

/** Confined, size-capped reader over the chosen skills. */
export function createSkillTools(skills: readonly InstalledSkill[]): SkillTools {
  const byId = new Map(skills.map(s => [s.id, s]))
  return {
    list: () => (skills.length ? skillIndex(skills) : 'No skills are installed.'),
    read(id, file) {
      const skill = byId.get(String(id))
      if (!skill) throw new Error(`No skill "${String(id)}". Call list_skills to see what is installed.`)
      const rel = typeof file === 'string' && file.trim() ? file : 'SKILL.md'
      const root = fs.realpathSync(skill.path)
      const abs = path.resolve(root, rel)
      if (path.isAbsolute(rel) || (abs !== root && !abs.startsWith(root + path.sep))) throw new Error('file must be a relative path inside the skill')
      const real = fs.realpathSync(abs) // follows links, so one pointing out of the skill fails the check below
      if (!real.startsWith(root + path.sep) || path.basename(real) === MARKER) throw new Error('file must be a relative path inside the skill')
      if (!fs.statSync(real).isFile()) {
        return `${rel} is a folder:\n${fs.readdirSync(real).join('\n')}`
      }
      const text = fs.readFileSync(real, 'utf8')
      return text.length > READ_CAP ? `${text.slice(0, READ_CAP)}\n… [truncated ${text.length - READ_CAP} chars]` : text
    },
  }
}

const NOOP: PreparedSkills = { env: {}, promptHint: null, tools: null, ids: [], cleanup: () => {} }

/**
 * `ids` is a run's explicit set (the Agent screen's /skill picker); omit for every enabled skill.
 * The `api` runner is career-ops' own script, which cannot take skills, so it gets nothing.
 */
export function prepareSkills(runner: SkillRunner, cwd: string, ids?: readonly string[], installed: readonly InstalledSkill[] = provider()): PreparedSkills {
  const skills = selectSkills(installed, ids)
  if (!skills.length || runner === 'api') return NOOP

  if (runner === 'zen') {
    return {
      env: {}, ids: skills.map(s => s.id), tools: createSkillTools(skills), cleanup: () => {},
      promptHint: `Agent Skills are installed. When a task fits one, call read_skill with its id to load its instructions (and read_skill with a file for its references). list_skills shows this index again:\n${skillIndex(skills)}`,
    }
  }

  const rel = SKILL_DIRS[runner]!
  const placed: Array<{ skill: InstalledSkill; dest: string }> = []
  try {
    for (const skill of skills) {
      const dest = place(cwd, rel, skill)
      if (dest) placed.push({ skill, dest })
    }
  } catch (err) {
    placed.forEach(p => release(p.dest))
    throw err
  }
  let done = false
  return {
    env: {}, tools: null, ids: placed.map(p => p.skill.id),
    cleanup: () => { if (!done) { done = true; placed.forEach(p => release(p.dest)) } },
    promptHint: NEEDS_INDEX.has(runner) && placed.length
      ? `Agent Skills are installed in ${rel}/. When a task fits one, read its SKILL.md first:\n${placed.map(p => `- ${p.skill.id}: ${p.skill.description} (${rel}/${p.skill.id}/SKILL.md)`).join('\n')}`
      : null,
  }
}
