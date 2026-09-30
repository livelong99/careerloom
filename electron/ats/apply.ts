// Applying a finding to cv.md: pure edit operations, preview, and the undo stack rules. Pure.
import type { ApplyOp, AtsPreview } from '../contract'
import { factCheck } from './factCheck'

export type Answers = Record<string, string | number>
export const OVERRIDE_ID = '_override'
export const haveId = (skill: string) => `have:${skill}`

export type Edit = { ok: true; after: string; diff: { before: string; after: string } } | { ok: false; error: string }
const fail = (error: string): Edit => ({ ok: false, error })

const fill = (text: string, answers: Answers) => text.replace(/\{\{\s*([^}\s]+)\s*\}\}/g, (_, id: string) => String(answers[id] ?? ''))
const yes = (v: string | number | undefined) => v !== undefined && !/^(no|false|0|n)$/i.test(String(v).trim())

/** Every answer the op needs, in order; a `have:` answer must be a yes. */
export function unmetAnswers(op: ApplyOp, answers: Answers): string[] {
  return op.requires_answers.filter(id => (id.startsWith('have:') ? !yes(answers[id]) : answers[id] === undefined || String(answers[id]).trim() === ''))
}

const headingMatch = (line: string, target: string) => /^#{1,3}\s/.test(line) && line.replace(/^#+\s*/, '').trim().toLowerCase() === target.replace(/^#+\s*/, '').trim().toLowerCase()

/** The text of `cv` after `op`. Never guesses: a missing or ambiguous target is an error, not a best effort. */
export function applyOp(cv: string, op: ApplyOp, answers: Answers = {}): Edit {
  const after = fill(op.after, answers)
  if (op.op === 'rebuild-profile') return { ok: true, after: cv, diff: { before: '', after: '' } }
  if (op.op === 'replace' || op.op === 'delete') {
    const n = cv.split(op.target).length - 1
    if (!op.target || n === 0) return fail('The text this change targets is no longer in your résumé')
    if (n > 1) return fail('The text this change targets appears more than once, so it cannot be applied safely')
    const next = op.op === 'delete' ? cv.replace(op.target, '').replace(/\n{3,}/g, '\n\n') : cv.replace(op.target, () => after)
    return { ok: true, after: next, diff: { before: op.target, after: op.op === 'delete' ? '' : after } }
  }
  const lines = cv.split('\n')
  if (op.op === 'insert') {
    const hits = lines.map((l, i) => (l.trim() === op.target.trim() || headingMatch(l, op.target) ? i : -1)).filter(i => i >= 0)
    if (hits.length !== 1) return fail(hits.length ? 'The line to insert after appears more than once' : 'The line to insert after is no longer in your résumé')
    const at = hits[0]!
    const next = [...lines.slice(0, at + 1), ...after.split('\n'), ...lines.slice(at + 1)].join('\n')
    return { ok: true, after: next, diff: { before: lines[at]!, after: `${lines[at]}\n${after}` } }
  }
  // append: to the end of the named section (created at the end of the file when it does not exist yet)
  const start = lines.findIndex(l => headingMatch(l, op.target))
  if (start < 0) {
    const title = op.target.replace(/^#+\s*/, '').trim()
    const next = `${cv.replace(/\s*$/, '')}\n\n## ${title}\n\n${after}\n`
    return { ok: true, after: next, diff: { before: '', after: `## ${title}\n\n${after}` } }
  }
  let end = lines.findIndex((l, i) => i > start && /^##\s/.test(l))
  if (end < 0) end = lines.length
  while (end > start + 1 && !lines[end - 1]!.trim()) end--
  const next = [...lines.slice(0, end), ...after.split('\n'), ...lines.slice(end)].join('\n')
  return { ok: true, after: next, diff: { before: lines[end - 1] ?? '', after: `${lines[end - 1] ?? ''}\n${after}` } }
}

/** Preview = the edit plus the fabrication check; `error` when it cannot be applied yet. */
export function previewOp(cv: string, op: ApplyOp, answers: Answers = {}): AtsPreview & { error?: string; unmet: string[] } {
  const unmet = unmetAnswers(op, answers)
  if (unmet.length) return { diff: { before: '', after: '' }, factCheck: { ok: true, violations: [] }, error: 'Answer the question first', unmet }
  const edit = applyOp(cv, op, answers)
  if (!edit.ok) return { diff: { before: '', after: '' }, factCheck: { ok: true, violations: [] }, error: edit.error, unmet: [] }
  return { diff: edit.diff, factCheck: factCheck(cv, edit.after, Object.entries(answers).filter(([k]) => k !== OVERRIDE_ID && (!k.startsWith('have:') || yes(answers[k]))).map(([k, v]) => (k.startsWith('have:') ? `${k.slice(5)} ${v}` : v))), unmet: [] }
}

export type UndoEntry = { undoId: string; findingId: string; before: string; after: string; at: number }
export const UNDO_LIMIT = 50
export const pushUndo = (stack: UndoEntry[], e: UndoEntry): UndoEntry[] => [...stack, e].slice(-UNDO_LIMIT)
