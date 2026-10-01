// The anti-fabrication gate: an Apply may rephrase what cv.md (or the user's answers) already says, never add facts. Pure.
import { extractSkills } from './skills'

export type FactCheck = { ok: boolean; violations: string[] }

const NUM = /\d[\d,]*(?:\.\d+)?\s*(?:k|m|x|%)?/gi
const NAME = /\b[A-Z][A-Za-z0-9&.+-]{2,}(?:\s+[A-Z][A-Za-z0-9&.+-]+)*/g
// Words that may appear capitalised without being a fact (sentence openers are skipped separately).
const COMMON = new Set('the and for with from that this into over under across about team teams using used use via our their your all new'.split(' '))

/** "150K" / "150,000" / "150000" → 150000; "40%" → 40. Units fold into the value so rephrasing does not look new. */
function numberValue(tok: string): number {
  const t = tok.trim().toLowerCase()
  const n = parseFloat(t.replace(/,/g, ''))
  if (/k$/.test(t)) return n * 1_000
  if (/m$/.test(t)) return n * 1_000_000
  return n
}
const numbersOf = (text: string) => new Set((text.match(NUM) ?? []).map(numberValue).filter(n => !Number.isNaN(n)))

/** Lines of `after` that `before` does not have (multiset difference): what this edit actually wrote. */
export function addedText(before: string, after: string): string {
  const pool = new Map<string, number>()
  for (const l of before.split('\n')) pool.set(l.trim(), (pool.get(l.trim()) ?? 0) + 1)
  return after.split('\n').filter(l => {
    const k = l.trim()
    const n = pool.get(k) ?? 0
    if (n > 0) { pool.set(k, n - 1); return false }
    return k.length > 0
  }).join('\n')
}

/** `known` = cv.md plus everything the user told us (answers). */
export function factCheck(before: string, after: string, answers: Array<string | number> = []): FactCheck {
  const added = addedText(before, after)
  if (!added) return { ok: true, violations: [] }
  const known = `${before}\n${answers.join('\n')}`
  const lower = known.toLowerCase()
  const violations: string[] = []

  const have = numbersOf(known)
  for (const n of numbersOf(added)) if (!have.has(n)) violations.push(`The number ${n} is not in your résumé or your answers`)

  const haveSkills = extractSkills(known)
  for (const s of extractSkills(added)) if (!haveSkills.has(s)) violations.push(`The skill "${s}" is not in your résumé or your answers`)

  for (const line of added.split('\n')) {
    const body = line.replace(/^\s*(?:[-*•]|#+)\s+/, '').replace(/[*_`]/g, '')
    for (const m of body.matchAll(NAME)) {
      if (m.index === 0 || /[.!?]\s*$/.test(body.slice(0, m.index))) continue // sentence opener: a verb, not a name
      const phrase = m[0]
      const words = phrase.split(/\s+/)
      if (words.every(w => COMMON.has(w.toLowerCase()) || lower.includes(w.toLowerCase()))) continue
      if (extractSkills(phrase).size) continue // reported above as a skill
      violations.push(`"${phrase}" is not in your résumé or your answers`)
    }
  }
  return { ok: violations.length === 0, violations: [...new Set(violations)] }
}
