// Fetch → inspect: turns a SkillSource into a staged folder plus the SkillPreview the user consents to.
import { createHash } from 'node:crypto'
import { execFile } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { parseSkill, SkillError } from './parse'
import { SKILL_LIMITS, type SkillPreview, type SkillSource } from './types'
import { extractZip } from './zip'

export type GitRunner = (args: string[], opts: { cwd?: string }) => Promise<void>
export type InspectDeps = { git?: GitRunner; tmpRoot?: string; /** ids already installed, to fill `replaces`. */ installedIds?: ReadonlySet<string> }
/** A fetched skill, ready to copy. `cleanup` removes any temp files (a no-op for folders read in place). */
export type Staged = { dir: string; preview: SkillPreview; cleanup: () => void }

const SCRIPT_EXT = new Set(['.sh', '.bash', '.zsh', '.fish', '.py', '.js', '.mjs', '.cjs', '.ts', '.rb', '.pl', '.php', '.ps1', '.bat', '.cmd', '.command'])
const BINARY_EXT = new Set(['.exe', '.dll', '.so', '.dylib', '.bin', '.wasm', '.node', '.o', '.a', '.jar', '.class', '.pyc'])
const MEDIA_EXT = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.ico', '.pdf', '.woff', '.woff2', '.ttf', '.otf'])
const BIG_FILE = 1024 * 1024
const SKIP_DIRS = new Set(['.git', 'node_modules', '.DS_Store'])

// ————— Git sources —————

const GIT_TIMEOUT_MS = 120_000
const SAFE_REF = /^[A-Za-z0-9][\w./-]{0,99}$/
const OWNER_REPO = /^([A-Za-z0-9][\w.-]*)\/([A-Za-z0-9][\w.-]*)$/

export type GitTarget = { url: string; ref?: string; subdir?: string }

/**
 * `owner/repo[/subdir][@ref]` → GitHub https URL; https:// and ssh (`git@host:path`, `ssh://`) URLs pass.
 * Everything else (file:, git:, http:, ext::, `-flags`) is rejected: the URL goes to `git clone` as an argument.
 */
export function normalizeGit(source: { url: string; ref?: string; subdir?: string }): GitTarget {
  let url = source.url.trim()
  let ref = source.ref?.trim() || undefined
  let subdir = source.subdir?.trim().replace(/^\/+|\/+$/g, '') || undefined
  if (!url || /\s/.test(url) || url.startsWith('-')) throw new SkillError('Enter a GitHub repository (owner/repo) or a git URL', 'source')

  if (!/^[a-z][a-z0-9+.-]*:/i.test(url) && !/^[\w.-]+@[\w.-]+:/.test(url)) {
    // Shorthand: owner/repo[/subdir...][@ref]
    const at = url.lastIndexOf('@')
    if (at > 0) { ref ??= url.slice(at + 1); url = url.slice(0, at) }
    const [owner, repo, ...rest] = url.split('/')
    if (!owner || !repo || !OWNER_REPO.test(`${owner}/${repo}`)) throw new SkillError('Use owner/repo, owner/repo/subfolder, or a full git URL', 'source')
    if (rest.length) subdir ??= rest.join('/')
    url = `https://github.com/${owner}/${repo.replace(/\.git$/, '')}`
  } else if (/^https:\/\//i.test(url)) {
    const u = new URL(url) // throws on malformed
    if (u.username || u.password) throw new SkillError('Do not put credentials in the URL', 'source')
  } else if (!/^ssh:\/\/[^\s]+$/i.test(url) && !/^[\w.-]+@[\w.-]+:[^\s]+$/.test(url)) {
    throw new SkillError('Only https:// and ssh git URLs (or owner/repo) are allowed', 'source')
  }
  if (ref && !SAFE_REF.test(ref)) throw new SkillError('That branch or tag name is not valid', 'source')
  if (subdir) {
    const clean = path.posix.normalize(subdir.replaceAll('\\', '/'))
    if (clean.startsWith('..') || clean.startsWith('/') || clean.split('/').includes('..') || subdir.includes('\0')) throw new SkillError('The subfolder must stay inside the repository', 'source')
    subdir = clean === '.' ? undefined : clean
  }
  return { url, ref, subdir }
}

const defaultGit: GitRunner = (args, opts) => new Promise((resolve, reject) => {
  execFile('git', args, {
    cwd: opts.cwd, timeout: GIT_TIMEOUT_MS, windowsHide: true, maxBuffer: 1024 * 1024,
    // Never prompt, and never follow a clone into a protocol other than https/ssh.
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_ALLOW_PROTOCOL: 'https:ssh', GIT_CONFIG_NOSYSTEM: '1' },
  }, (err, _out, stderr) => (err ? reject(new SkillError(`git clone failed: ${(stderr || err.message).trim().split('\n').pop()}`, 'source')) : resolve()))
})

// ————— Walking a staged folder —————

type Walk = { files: Array<{ rel: string; abs: string; size: number; mode: number }>; skipped: string[] }

/** Regular files under `root`. Symlinks that leave the folder throw; ones that stay inside are skipped (never copied). */
export function walkSkill(root: string): Walk {
  const real = fs.realpathSync(root)
  const files: Walk['files'] = []
  const skipped: string[] = []
  let bytes = 0
  const visit = (dir: string, rel: string) => {
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (SKIP_DIRS.has(e.name)) continue
      const abs = path.join(dir, e.name)
      const r = rel ? `${rel}/${e.name}` : e.name
      if (e.isSymbolicLink()) {
        let target: string
        try { target = fs.realpathSync(abs) } catch { throw new SkillError(`Broken symlink ${r}; symlinks are not allowed`, 'unsafe') }
        if (target !== real && !target.startsWith(real + path.sep)) throw new SkillError(`${r} is a symlink that points outside the skill`, 'unsafe')
        skipped.push(r)
      } else if (e.isDirectory()) visit(abs, r)
      else if (e.isFile()) {
        const st = fs.statSync(abs)
        bytes += st.size
        if (files.length + 1 > SKILL_LIMITS.maxFiles) throw new SkillError(`The skill has more than ${SKILL_LIMITS.maxFiles} files`, 'limits')
        if (bytes > SKILL_LIMITS.maxBytes) throw new SkillError(`The skill is larger than ${SKILL_LIMITS.maxBytes / 1024 / 1024} MB`, 'limits')
        files.push({ rel: r, abs, size: st.size, mode: st.mode })
      }
    }
  }
  visit(real, '')
  files.sort((a, b) => (a.rel < b.rel ? -1 : 1))
  return { files, skipped }
}

/** Copy only what walkSkill found (regular files), keeping the executable bit. */
export function copySkill(from: string, to: string): void {
  for (const f of walkSkill(from).files) {
    const dest = path.join(to, ...f.rel.split('/'))
    fs.mkdirSync(path.dirname(dest), { recursive: true })
    fs.copyFileSync(f.abs, dest)
    fs.chmodSync(dest, f.mode & 0o111 ? 0o755 : 0o644)
  }
}

const looksBinary = (abs: string): boolean => {
  const fd = fs.openSync(abs, 'r')
  try {
    const b = Buffer.alloc(512)
    return b.subarray(0, fs.readSync(fd, b, 0, 512, 0)).includes(0)
  } finally { fs.closeSync(fd) }
}

/** Parse + measure a skill folder. Pure over the filesystem; `source` is recorded in the preview. */
export function inspectDir(dir: string, source: SkillSource, installedIds: ReadonlySet<string> = new Set()): SkillPreview & { hash: string } {
  const skillMd = path.join(dir, 'SKILL.md')
  if (!fs.existsSync(skillMd)) throw new SkillError('No SKILL.md at the top of this folder. For a repository with several skills, add the subfolder (owner/repo/skills/name).', 'invalid')
  const { files, skipped } = walkSkill(dir)
  const meta = parseSkill(fs.readFileSync(skillMd, 'utf8'), fs.existsSync(path.join(dir, 'careerloom.json')) ? fs.readFileSync(path.join(dir, 'careerloom.json'), 'utf8') : null)

  const scripts: string[] = []
  const warnings: string[] = []
  const hash = createHash('sha256')
  let sizeBytes = 0
  for (const f of files) {
    const ext = path.extname(f.rel).toLowerCase()
    sizeBytes += f.size
    hash.update(`${f.rel}\0${f.mode & 0o111 ? 'x' : '-'}\0`).update(fs.readFileSync(f.abs))
    if (f.rel.startsWith('scripts/') || SCRIPT_EXT.has(ext) || f.mode & 0o111) scripts.push(f.rel)
    if (BINARY_EXT.has(ext) || (!MEDIA_EXT.has(ext) && !SCRIPT_EXT.has(ext) && f.size > 0 && looksBinary(f.abs))) warnings.push(`${f.rel} is a binary file`)
    else if (f.size > BIG_FILE) warnings.push(`${f.rel} is large (${(f.size / BIG_FILE).toFixed(1)} MB)`)
  }
  if (skipped.length) warnings.push(`${skipped.length} symlink${skipped.length === 1 ? '' : 's'} inside the skill will not be installed`)
  return {
    id: meta.id, name: meta.name, description: meta.description, version: meta.version, source,
    sizeBytes, fileCount: files.length, scripts, provides: meta.provides, warnings, replaces: installedIds.has(meta.id), hash: hash.digest('hex'),
  }
}

// ————— Staging —————

/** A skill folder is the directory holding SKILL.md: the top, or the only wrapper folder (GitHub zips). */
function skillRoot(dir: string): string {
  if (fs.existsSync(path.join(dir, 'SKILL.md'))) return dir
  const kids = fs.readdirSync(dir, { withFileTypes: true }).filter(e => !SKIP_DIRS.has(e.name) && e.name !== '__MACOSX')
  return kids.length === 1 && kids[0]!.isDirectory() ? path.join(dir, kids[0]!.name) : dir
}

const resolveInside = (base: string, rel: string): string => {
  const full = path.resolve(base, rel)
  if (!full.startsWith(path.resolve(base) + path.sep)) throw new SkillError('The subfolder must stay inside the repository', 'source')
  return full
}

/** Fetch `source` into a temp dir (git, zip) or point at it (folder), then inspect it. */
export async function stage(source: SkillSource, deps: InspectDeps = {}): Promise<Staged> {
  const installedIds = deps.installedIds ?? new Set<string>()
  if (source.kind === 'folder') {
    if (!path.isAbsolute(source.path) || !fs.existsSync(source.path) || !fs.statSync(source.path).isDirectory()) throw new SkillError('That folder does not exist', 'source')
    const dir = skillRoot(source.path)
    return { dir, preview: inspectDir(dir, source, installedIds), cleanup: () => {} }
  }
  const tmp = fs.mkdtempSync(path.join(deps.tmpRoot ?? os.tmpdir(), 'careerloom-skill-'))
  const cleanup = () => fs.rmSync(tmp, { recursive: true, force: true })
  try {
    let dir: string
    let recorded: SkillSource = source
    if (source.kind === 'zip') {
      if (!path.isAbsolute(source.path) || !/\.zip$/i.test(source.path) || !fs.existsSync(source.path)) throw new SkillError('Pick an existing .zip file', 'source')
      extractZip(source.path, tmp)
      dir = skillRoot(tmp)
    } else {
      const g = normalizeGit(source)
      recorded = { kind: 'git', url: g.url, ...(g.ref ? { ref: g.ref } : {}), ...(g.subdir ? { subdir: g.subdir } : {}) }
      const clone = path.join(tmp, 'repo')
      await (deps.git ?? defaultGit)(['clone', '--depth', '1', '--no-tags', '--single-branch', ...(g.ref ? ['--branch', g.ref] : []), '--', g.url, clone], { cwd: tmp })
      dir = g.subdir ? resolveInside(clone, g.subdir) : clone
      if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) throw new SkillError(`The repository has no folder "${g.subdir}"`, 'source')
      const real = fs.realpathSync(dir)
      if (real !== fs.realpathSync(clone) && !real.startsWith(fs.realpathSync(clone) + path.sep)) throw new SkillError('The subfolder must stay inside the repository', 'unsafe')
    }
    return { dir, preview: inspectDir(dir, recorded, installedIds), cleanup }
  } catch (err) {
    cleanup()
    throw err
  }
}

/** Preview only: stage, read, clean up. */
export async function inspectSource(source: SkillSource, deps: InspectDeps = {}): Promise<SkillPreview> {
  const staged = await stage(source, deps)
  try { return staged.preview } finally { staged.cleanup() }
}
