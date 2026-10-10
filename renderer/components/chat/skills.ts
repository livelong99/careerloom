import type { InstalledSkill } from '../../../electron/skills/types'
import { careerloom } from '../../lib/ipc'
import { navigate } from '../../lib/nav'

type SkillsBridge = { skillsList?: () => Promise<InstalledSkill[]> }

/** Installed, enabled skills. Empty (never an error) while the skills bridge is absent or failing. */
export async function listEnabledSkills(): Promise<InstalledSkill[]> {
  const list = (careerloom as unknown as SkillsBridge | undefined)?.skillsList
  if (typeof list !== 'function') return []
  try { return (await list.call(careerloom)).filter(s => s.enabled) } catch { return [] }
}

/** Settings › Skills; the page id is cast until the Settings page registers it. */
export const openSkillsSettings = () => navigate('settings', { page: 'skills' as never })

/** Case-insensitive match on id, name or description; name matches first. */
export function filterSkills(skills: InstalledSkill[], query: string): InstalledSkill[] {
  const q = query.trim().toLowerCase()
  if (!q) return skills
  const rank = (s: InstalledSkill) => (s.id.toLowerCase().startsWith(q) || s.name.toLowerCase().startsWith(q) ? 0 : s.id.toLowerCase().includes(q) || s.name.toLowerCase().includes(q) ? 1 : s.description.toLowerCase().includes(q) ? 2 : 3)
  return skills.filter(s => rank(s) < 3).sort((a, b) => rank(a) - rank(b))
}

/** The `/query` being typed right before the caret, or null. Only at the start of the text or after whitespace. */
export function slashQuery(text: string, caret: number): { query: string; start: number } | null {
  const m = /(^|\s)\/([\w.-]*)$/.exec(text.slice(0, caret))
  return m ? { query: m[2]!, start: caret - m[2]!.length - 1 } : null
}
