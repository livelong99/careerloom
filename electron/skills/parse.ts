// SKILL.md frontmatter + careerloom.json parsing and validation (Agent Skills standard).
import { parse as parseYaml } from 'yaml'

export const NAME_MAX = 64
export const DESCRIPTION_MAX = 1024
export const VERSION_MAX = 40

/** A problem with a skill the user can act on; the message is shown as-is. */
export class SkillError extends Error {
  constructor(message: string, readonly code: 'invalid' | 'limits' | 'unsafe' | 'source' | 'consent' | 'missing' = 'invalid') {
    super(message)
    this.name = 'SkillError'
  }
}

export type SkillMeta = { id: string; name: string; description: string; version: string | null; license: string | null; provides: string[] }

/** "Cover Notes!" → "cover-notes". Empty when nothing usable is left. */
export function kebab(name: string): string {
  return name.normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '')
}

export const isSkillId = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9][a-z0-9-]{0,63}$/.test(v)

function frontmatter(text: string): Record<string, unknown> {
  const m = /^﻿?---[ \t]*\r?\n([\s\S]*?)\r?\n---[ \t]*(?:\r?\n|$)/.exec(text)
  if (!m) throw new SkillError('SKILL.md must start with a --- frontmatter block holding name and description')
  let data: unknown
  try { data = parseYaml(m[1]!) } catch (err) { throw new SkillError(`SKILL.md frontmatter is not valid YAML: ${err instanceof Error ? err.message : String(err)}`) }
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new SkillError('SKILL.md frontmatter must be a set of key: value lines')
  return data as Record<string, unknown>
}

const text = (v: unknown): string | null => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() || null : null)

/** `provides` entries are capability names or `{ capability, entry }` objects. */
function providesOf(json: unknown): string[] {
  const list = (json as { provides?: unknown } | null)?.provides
  if (!Array.isArray(list)) return []
  const names = list.map(p => (typeof p === 'string' ? p : text((p as { capability?: unknown } | null)?.capability))).filter((p): p is string => !!p && p.length <= 80)
  return [...new Set(names)].slice(0, 20)
}

/** `skillMd` is the file text; `careerloomJson` the optional careerloom.json text. Throws SkillError. */
export function parseSkill(skillMd: string, careerloomJson?: string | null): SkillMeta {
  const fm = frontmatter(skillMd)
  const name = text(fm.name)
  const description = text(fm.description)
  if (!name) throw new SkillError('SKILL.md needs a name in its frontmatter')
  if (name.length > NAME_MAX) throw new SkillError(`Skill name is longer than ${NAME_MAX} characters`)
  const id = kebab(name)
  if (!isSkillId(id)) throw new SkillError('Skill name must contain letters or numbers (it becomes the folder name)')
  if (!description) throw new SkillError('SKILL.md needs a description in its frontmatter, so agents know when to use the skill')
  if (description.length > DESCRIPTION_MAX) throw new SkillError(`Skill description is longer than ${DESCRIPTION_MAX} characters`)

  let extra: unknown = null
  if (careerloomJson) {
    try { extra = JSON.parse(careerloomJson) } catch { throw new SkillError('careerloom.json is not valid JSON') }
  }
  const meta = fm.metadata as { version?: unknown } | undefined
  const version = text((extra as { version?: unknown } | null)?.version) ?? text(fm.version) ?? text(meta?.version)
  if (version && version.length > VERSION_MAX) throw new SkillError(`Skill version is longer than ${VERSION_MAX} characters`)
  return { id, name, description, version, license: text(fm.license), provides: providesOf(extra) }
}
