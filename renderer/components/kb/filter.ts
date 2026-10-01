import type { KbItemView, KbQuestionType, Provenance } from '../../../electron/kb/types'

export type SortKey = 'default' | 'type' | 'level' | 'origin'
export type BankFilter = {
  type: KbQuestionType | 'all'; skill: string | 'all'; difficulty: 'any' | 'easy' | 'mid' | 'hard'; source: Provenance | 'all'; hideGenerated: boolean; text: string
}
export const NO_FILTER: BankFilter = { type: 'all', skill: 'all', difficulty: 'any', source: 'all', hideGenerated: false, text: '' }
export const isFiltered = (f: BankFilter): boolean => JSON.stringify(f) !== JSON.stringify(NO_FILTER)

const band = (d: number): BankFilter['difficulty'] => (d <= 2 ? 'easy' : d === 3 ? 'mid' : 'hard')
const ORIGIN: Record<Provenance, number> = { sourced: 0, user: 1, generated: 2 }

export function applyFilter(items: readonly KbItemView[], f: BankFilter, showHidden: boolean): KbItemView[] {
  const q = f.text.trim().toLowerCase()
  return items.filter(i =>
    (showHidden || !i.user.hidden) && (f.type === 'all' || i.type === f.type) && (f.skill === 'all' || i.skills.includes(f.skill))
    && (f.difficulty === 'any' || band(i.difficulty) === f.difficulty) && (f.source === 'all' || i.provenance === f.source)
    && !(f.hideGenerated && i.provenance === 'generated') && (!q || i.text.toLowerCase().includes(q)))
}

/** Pinned first, then the chosen column; ties keep the server order (stable sort). */
export function sortItems(items: readonly KbItemView[], key: SortKey, dir: 1 | -1): KbItemView[] {
  const by = (i: KbItemView): number | string => (key === 'type' ? i.type : key === 'level' ? i.difficulty : key === 'origin' ? ORIGIN[i.provenance] : 0)
  return [...items].sort((a, b) => Number(b.user.pinned) - Number(a.user.pinned) || (by(a) < by(b) ? -dir : by(a) > by(b) ? dir : 0))
}

export const TYPE_LABEL: Record<KbQuestionType, string> = { behavioural: 'Behavioural', technical: 'Technical', 'system-design': 'System design', coding: 'Coding', situational: 'Situational', recruiter: 'Recruiter' }
export const ORIGIN_LABEL: Record<Provenance, string> = { sourced: 'Sourced', generated: 'Generated', user: 'Yours' }
