// GitHub skill URLs: strict validation, reachability, and entrypoint detection.
// No `electron` import — testable directly (same discipline as runner.ts).
import { spawn } from 'node:child_process'
import fs from 'node:fs'
import path from 'node:path'
import * as yaml from 'yaml'

import { spawnSpec } from '../runner'

// owner/repo: no slashes, no `..` traversal (the charset simply excludes `/`,
// so an extra path segment like `.../a/b/../c` fails to match at all).
const OWNER_REPO = '[A-Za-z0-9_.-]+'
export const GITHUB_URL_RE = new RegExp(`^https://github\\.com/(${OWNER_REPO})/(${OWNER_REPO})(?:\\.git)?/?$`)

export function parseGithubUrl(raw: string): { owner: string; repo: string; cloneUrl: string } | null {
  const m = GITHUB_URL_RE.exec(raw.trim())
  if (!m) return null
  const [, owner, repo] = m
  return { owner, repo: repo.replace(/\.git$/, ''), cloneUrl: `https://github.com/${owner}/${repo}.git` }
}

/** `git ls-remote` the repo's HEAD — cheap reachability check, no clone. */
export function ghReachable(cloneUrl: string, timeoutMs = 8000): Promise<boolean> {
  return new Promise(resolve => {
    let spec
    try { spec = spawnSpec('git', ['ls-remote', '--exit-code', cloneUrl, 'HEAD']) } catch { return resolve(false) }
    const child = spawn(spec.bin, spec.args, { env: spec.env, shell: false, windowsHide: true, stdio: 'ignore' })
    const timer = setTimeout(() => { child.kill('SIGTERM'); resolve(false) }, timeoutMs)
    child.on('error', () => { clearTimeout(timer); resolve(false) })
    child.on('close', code => { clearTimeout(timer); resolve(code === 0) })
  })
}

export type SkillEntrypoint = { rel: string; name: string | null; description: string | null }

/** Parses the leading `---\n...\n---` YAML frontmatter of a SKILL.md. */
export function parseSkillFrontmatter(md: string): { name?: string; description?: string } {
  const m = /^---\n([\s\S]*?)\n---/.exec(md)
  if (!m) return {}
  try {
    const doc = yaml.parse(m[1]) as { name?: unknown; description?: unknown } | null
    return {
      name: typeof doc?.name === 'string' ? doc.name : undefined,
      description: typeof doc?.description === 'string' ? doc.description : undefined,
    }
  } catch {
    return {}
  }
}

/** Finds SKILL.md / AGENTS.md / CLAUDE.md entrypoints inside a cloned skill dir. */
export function detectEntrypoints(dir: string): SkillEntrypoint[] {
  const found: SkillEntrypoint[] = []
  for (const base of ['.claude/skills', '.agents/skills']) {
    const skillsDir = path.join(dir, base)
    let names: string[] = []
    try { names = fs.readdirSync(skillsDir, { withFileTypes: true }).filter(e => e.isDirectory()).map(e => e.name) } catch { continue }
    for (const name of names) {
      const rel = path.join(base, name, 'SKILL.md')
      const full = path.join(dir, rel)
      if (!fs.existsSync(full)) continue
      let front: { name?: string; description?: string } = {}
      try { front = parseSkillFrontmatter(fs.readFileSync(full, 'utf8')) } catch { /* unreadable, still list it */ }
      found.push({ rel, name: front.name ?? null, description: front.description ?? null })
    }
  }
  // A repo that IS one skill keeps its SKILL.md at the root (e.g. blader/humanizer).
  const root = path.join(dir, 'SKILL.md')
  if (fs.existsSync(root)) {
    let front: { name?: string; description?: string } = {}
    try { front = parseSkillFrontmatter(fs.readFileSync(root, 'utf8')) } catch { /* unreadable, still list it */ }
    found.push({ rel: 'SKILL.md', name: front.name ?? null, description: front.description ?? null })
  }
  for (const rel of ['AGENTS.md', 'CLAUDE.md']) {
    if (fs.existsSync(path.join(dir, rel))) found.push({ rel, name: null, description: null })
  }
  return found
}
