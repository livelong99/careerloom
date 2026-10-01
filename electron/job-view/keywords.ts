// Which of a job's keywords the résumé already covers: deterministic, no model (ATS skill ladder).
import { buildCvIndex, matchSkill } from '../ats/skills'
import { parseCv } from '../ats/model'
import type { KeywordStatus } from './types'

export function keywordCoverage(keywords: string[], cvMarkdown: string): KeywordStatus[] {
  const seen = new Set<string>()
  const idx = buildCvIndex(parseCv(cvMarkdown))
  return keywords.flatMap((raw): KeywordStatus[] => {
    const keyword = raw.trim()
    if (!keyword || seen.has(keyword.toLowerCase())) return []
    seen.add(keyword.toLowerCase())
    const m = matchSkill(keyword, idx)
    const status = m.kind === 'exact' || m.kind === 'stem' ? 'covered' : m.kind === 'none' ? 'missing' : 'related'
    return [{ keyword, status, ...(m.via ? { via: m.via } : {}) }]
  })
}
