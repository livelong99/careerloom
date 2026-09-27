import type { Portal } from '../../lib/types'

export type BoardType = 'company' | 'board' | 'web' | 'browser'
export const TYPE_LABEL: Record<BoardType, string> = { company: 'Company ATS', board: 'Job board', web: 'Web · Firecrawl', browser: 'Browser' }
export const TYPE_ORDER: BoardType[] = ['company', 'board', 'web', 'browser']

export const boardType = (p: Portal): BoardType => (p.fetch === 'browser' ? 'browser' : p.kind ?? 'company')

/** "Today", "3d ago", "2mo ago"; null → "Never". */
export function ago(iso: string | null | undefined): string {
  if (!iso) return 'Never'
  const days = Math.floor((Date.now() - Date.parse(iso)) / 86_400_000)
  if (Number.isNaN(days)) return iso
  return days <= 0 ? 'Today' : days < 30 ? `${days}d ago` : days < 365 ? `${Math.floor(days / 30)}mo ago` : `${Math.floor(days / 365)}y ago`
}

export const hostOf = (url: string | null) => { try { return url ? new URL(url).host.replace(/^www\./, '') : '' } catch { return url ?? '' } }
