import { factCheck } from '../ats/factCheck'
import { inCv } from './gate'

export type ResumeEdit = { section: string; before: string; after: string; cv_source_quote: string }
export type Change = ResumeEdit & { status: 'applied' | 'rejected'; reason?: string }

const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '')

export function parseEdits(raw: unknown): ResumeEdit[] {
  const list = (raw && typeof raw === 'object' ? (raw as { edits?: unknown }).edits : null)
  return (Array.isArray(list) ? list : []).flatMap((x): ResumeEdit[] => {
    const o = (x ?? {}) as Record<string, unknown>
    return s(o.before) && s(o.after) ? [{ section: s(o.section) || 'Résumé', before: s(o.before), after: s(o.after), cv_source_quote: s(o.cv_source_quote) }] : []
  }).slice(0, 12)
}

/** Apply edits to a COPY of the résumé text, one at a time; an edit that fails any check is reported, not applied. */
export function applyEdits(cv: string, edits: ResumeEdit[]): { cv: string; changes: Change[] } {
  let cur = cv
  const changes = edits.map((e): Change => {
    const reject = (reason: string): Change => ({ ...e, status: 'rejected', reason })
    if (e.before === e.after) return reject('No change')
    if (!cur.includes(e.before)) return reject('The text to replace is not in your résumé')
    if (!inCv(e.cv_source_quote, cv)) return reject('No source quote from your résumé')
    // known facts = the whole original résumé, so rephrasing is fine and new numbers, skills or names are not
    const fc = factCheck(cv, e.after, [])
    if (!fc.ok) return reject(fc.violations[0]!)
    cur = cur.replace(e.before, () => e.after)
    return { ...e, status: 'applied' }
  })
  return { cv: cur, changes }
}

export const changesMarkdown = (changes: Change[], title: string): string =>
  `# Changes for ${title}\n\n${changes.map(c => `## ${c.section}${c.status === 'rejected' ? ` (not applied: ${c.reason})` : ''}\n\nBefore:\n\n> ${c.before.replace(/\n/g, '\n> ')}\n\nAfter:\n\n> ${c.after.replace(/\n/g, '\n> ')}\n`).join('\n')}`
