// IPC for the skill registry (docs/architecture/engine-and-skills.md §8). Pure over its deps so it is tested without electron;
// ipc.ts binds it to the app. The renderer is untrusted: every argument is validated here.
import type { Handler } from '../context'
import { isSkillId, SkillError } from './parse'
import type { SkillRegistry } from './registry'
import type { SkillSource } from './types'

export type PickKind = 'folder' | 'zip'
export type SkillsDeps = {
  registry: () => SkillRegistry
  /** Native file/folder dialog; resolves to the chosen path or null. */
  pick: (kind: PickKind) => Promise<string | null>
}

const MAX_FIELD = 500
const field = (v: unknown, what: string, optional = false): string | undefined => {
  if (v === undefined || v === null || v === '') {
    if (optional) return undefined
    throw new SkillError(`${what} is required`, 'source')
  }
  if (typeof v !== 'string' || v.length > MAX_FIELD || v.includes('\0')) throw new SkillError(`${what} is not valid`, 'source')
  return v
}

/** Local paths are accepted only if the native dialog returned them this session; git fields are checked again by normalizeGit. */
export function validateSource(raw: unknown, picked: ReadonlySet<string>): SkillSource {
  const o = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>
  switch (o.kind) {
    case 'git': return { kind: 'git', url: field(o.url, 'The repository')!, ...opt('ref', field(o.ref, 'ref', true)), ...opt('subdir', field(o.subdir, 'subdir', true)) }
    case 'folder':
    case 'zip': {
      const p = field(o.path, 'The path')!
      if (!picked.has(p)) throw new SkillError('Choose the folder or file with the Browse button', 'source')
      return { kind: o.kind, path: p }
    }
    default: throw new SkillError('Unknown skill source', 'source')
  }
}
const opt = <K extends string>(key: K, v: string | undefined): { [P in K]?: string } => (v === undefined ? {} : ({ [key]: v } as { [P in K]?: string }))

const skillId = (v: unknown): string => {
  if (!isSkillId(v)) throw new SkillError('Not a valid skill id', 'missing')
  return v
}

export function createSkillsHandlers(deps: SkillsDeps): Record<string, Handler> {
  const picked = new Set<string>()
  return {
    skillsList: () => deps.registry().list(),
    skillsPick: async (kind: unknown) => {
      if (kind !== 'folder' && kind !== 'zip') throw new SkillError('Unknown picker', 'source')
      const p = await deps.pick(kind)
      if (p) picked.add(p)
      return p
    },
    skillsInspect: (source: unknown) => deps.registry().inspect(validateSource(source, picked)),
    skillsInstall: (source: unknown, opts: unknown) => {
      const confirmedScripts = (opts as { confirmedScripts?: unknown } | null | undefined)?.confirmedScripts === true
      return deps.registry().install(validateSource(source, picked), { confirmedScripts })
    },
    skillsSetEnabled: (id: unknown, enabled: unknown) => {
      if (typeof enabled !== 'boolean') throw new SkillError('enabled must be true or false')
      return deps.registry().setEnabled(skillId(id), enabled)
    },
    skillsRemove: (id: unknown) => { deps.registry().remove(skillId(id)) },
    skillsUpdate: (id: unknown) => deps.registry().update(skillId(id)),
  }
}
