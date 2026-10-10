// Installed skills: <base>/skills/<id>/ plus <base>/skills.json. Skills change only when the user asks (never auto-updated).
import fs from 'node:fs'
import path from 'node:path'

import { copySkill, stage, type InspectDeps } from './inspect'
import { isSkillId, SkillError } from './parse'
import type { InstalledSkill, SkillPreview, SkillSource } from './types'

type Stored = { version: 1; skills: InstalledSkill[] }
export type InstallOpts = { confirmedScripts?: boolean }

export type SkillRegistry = {
  list(): InstalledSkill[]
  /** Installed skills that are on. */
  enabled(): InstalledSkill[]
  inspect(source: SkillSource): Promise<SkillPreview>
  install(source: SkillSource, opts?: InstallOpts): Promise<InstalledSkill>
  setEnabled(id: string, enabled: boolean): InstalledSkill
  remove(id: string): void
  /** Re-inspect the recorded source. The caller shows the preview; `install` applies it. */
  update(id: string): Promise<SkillPreview>
}

/** Write via a temp file + rename so a crash never leaves a half-written registry. */
function writeAtomic(file: string, data: string): void {
  const tmp = `${file}.${process.pid}.tmp`
  fs.writeFileSync(tmp, data)
  fs.renameSync(tmp, file)
}

/** `base` is the app's userData folder; `deps` lets tests inject git and the temp root. */
export function createRegistry(base: string, deps: Pick<InspectDeps, 'git' | 'tmpRoot'> = {}): SkillRegistry {
  const dirOf = (id: string) => path.join(base, 'skills', id)
  const file = path.join(base, 'skills.json')

  const read = (): InstalledSkill[] => {
    let parsed: Stored
    try { parsed = JSON.parse(fs.readFileSync(file, 'utf8')) as Stored } catch { return [] }
    if (!Array.isArray(parsed?.skills)) return []
    // The folder is derived from the id, never trusted from the file.
    return parsed.skills.filter(s => isSkillId(s?.id)).map(s => ({ ...s, path: dirOf(s.id) }))
  }
  const write = (skills: InstalledSkill[]) => {
    fs.mkdirSync(base, { recursive: true })
    writeAtomic(file, `${JSON.stringify({ version: 1, skills } satisfies Stored, null, 2)}\n`)
  }
  const get = (id: string): InstalledSkill => {
    const s = isSkillId(id) ? read().find(k => k.id === id) : undefined
    if (!s) throw new SkillError(`No installed skill "${String(id).slice(0, 64)}"`, 'missing')
    return s
  }
  const idsOf = () => new Set(read().map(s => s.id))
  const inspect = async (source: SkillSource) => (await stage(source, { ...deps, installedIds: idsOf() })).preview

  return {
    list: read,
    enabled: () => read().filter(s => s.enabled && fs.existsSync(s.path)),
    inspect,

    async install(source, opts = {}) {
      const staged = await stage(source, { ...deps, installedIds: idsOf() })
      try {
        const p = staged.preview
        if (p.scripts.length && !opts.confirmedScripts) throw new SkillError(`${p.name} contains scripts (${p.scripts.slice(0, 3).join(', ')}${p.scripts.length > 3 ? ', …' : ''}). Review and confirm to install.`, 'consent')
        const dest = dirOf(p.id)
        // <userData>/skills is shared with the older Integrations skills (git clones); never move one of those aside.
        if (fs.existsSync(dest) && !read().some(k => k.id === p.id)) throw new SkillError(`A folder named "${p.id}" already exists in the skills folder (installed from Integrations?). Remove it first.`, 'invalid')
        const next = `${dest}.new`
        fs.rmSync(next, { recursive: true, force: true })
        fs.mkdirSync(next, { recursive: true })
        try { copySkill(staged.dir, next) } catch (err) { fs.rmSync(next, { recursive: true, force: true }); throw err }
        const old = `${dest}.old`
        fs.rmSync(old, { recursive: true, force: true })
        if (fs.existsSync(dest)) fs.renameSync(dest, old)
        fs.renameSync(next, dest)
        fs.rmSync(old, { recursive: true, force: true })

        const prior = read().find(s => s.id === p.id)
        const entry: InstalledSkill = {
          id: p.id, name: p.name, description: p.description, version: p.version, source: p.source, hash: p.hash ?? '', path: dest,
          enabled: prior?.enabled ?? true, installedAt: new Date().toISOString(), sizeBytes: p.sizeBytes, hasScripts: p.scripts.length > 0, provides: p.provides,
        }
        write([...read().filter(s => s.id !== p.id), entry].sort((a, b) => a.id.localeCompare(b.id)))
        return entry
      } finally { staged.cleanup() }
    },

    setEnabled(id, enabled) {
      const cur = get(id)
      const next = { ...cur, enabled: !!enabled }
      write(read().map(s => (s.id === id ? next : s)))
      return next
    },

    remove(id) {
      get(id)
      fs.rmSync(dirOf(id), { recursive: true, force: true })
      write(read().filter(s => s.id !== id))
    },

    update: async id => inspect(get(id).source),
  }
}
