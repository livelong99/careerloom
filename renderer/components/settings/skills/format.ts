import type { SkillSource } from '../../../lib/types'

export const fmtBytes = (n: number): string => (n < 1024 ? `${n} B` : n < 1024 * 1024 ? `${(n / 1024).toFixed(n < 10_240 ? 1 : 0)} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`)

/** One line naming where a skill came from. */
export function sourceLabel(s: SkillSource): string {
  if (s.kind === 'git') return `${s.url.replace(/^https:\/\/(www\.)?github\.com\//, '').replace(/\.git$/, '')}${s.subdir ? `/${s.subdir}` : ''}${s.ref ? ` @ ${s.ref}` : ''}`
  return s.path.split(/[\\/]/).filter(Boolean).slice(-2).join('/')
}
