// Apply / Undo / Dismiss: atomic cv.md writes with a persisted undo stack, then a rescore that never calls the agent. Serialised.
import type { AtsAnswer, AtsApplyResult, AtsHistoryItem, AtsPreview } from '../contract'
import { applyOp, OVERRIDE_ID, previewOp, pushUndo, type Answers } from './apply'
import { buildReport, type Deps } from './analyze'
import { sha, type Analysis } from './store'

let chain: Promise<unknown> = Promise.resolve()
/** One edit at a time: a double click must not interleave two writes to cv.md. */
const serial = <T>(fn: () => Promise<T>): Promise<T> => { const next = chain.then(fn, fn); chain = next.catch(() => undefined); return next }

export const toAnswers = (list: AtsAnswer[] = []): Answers => Object.fromEntries(list.map(a => [a.id, a.value]))
/** Answers given during the analysis plus the ones sent with this call (the latter win). */
const withStored = (a: Analysis, list: AtsAnswer[] = []) => toAnswers([...(a.answers ?? []), ...list])
const STALE = 'Your résumé changed since this analysis. Run the analysis again before applying.'

function context(deps: Deps, findingId: string) {
  const a = deps.store.current()
  const cv = deps.readCv()
  if (!a || !cv) throw new Error('There is no analysis yet')
  const f = a.report.findings.find(x => x.id === findingId)
  if (!f) throw new Error('That finding is no longer in the analysis')
  if (sha(cv) !== a.report.hashes.cv) throw new Error(STALE)
  return { a, cv, f }
}

async function rescored(deps: Deps, a: Analysis, cv: string, status?: { id: string; to: 'open' | 'applied' | 'dismissed' }): Promise<Analysis> {
  const prior = a.report.findings.map(f => (status && f.id === status.id ? { ...f, status: status.to } : f))
  const { report } = await buildReport(deps, a, cv, prior)
  const next = { ...a, report }
  deps.store.save(next)
  return next
}

export async function previewFinding(deps: Deps, findingId: string, answers: AtsAnswer[] = []): Promise<AtsPreview> {
  const { a, cv, f } = context(deps, findingId)
  if (!f.apply) throw new Error('This finding has no automatic change. Use the advice to edit your résumé yourself.')
  if (f.apply.op === 'rebuild-profile') return { diff: { before: 'Template data from the original extraction', after: 'Rebuilt from your cv.md: all sections, grouped skills, awards and contact links' }, factCheck: { ok: true, violations: [] } }
  const p = previewOp(cv, f.apply, withStored(a, answers))
  if (p.error) throw new Error(p.unmet.length ? `Answer first: ${p.unmet.join(', ')}` : p.error)
  return { diff: p.diff, factCheck: p.factCheck }
}

export const applyFinding = (deps: Deps, findingId: string, answers: AtsAnswer[] = []): Promise<AtsApplyResult> => serial(async () => {
  try {
    const { a, cv, f } = context(deps, findingId)
    if (!f.apply) return { ok: false, error: 'This finding has no automatic change.' }
    const ans = withStored(a, answers)
    if (f.apply.op === 'rebuild-profile') {
      if (!deps.rebuildProfile(cv)) return { ok: false, error: 'Could not read a name heading in cv.md to rebuild the template data from.' }
      const next = await rescored(deps, a, cv, { id: f.id, to: 'applied' })
      return { ok: true, rescore: next.report }
    }
    const p = previewOp(cv, f.apply, ans)
    if (p.error) return { ok: false, error: p.unmet.length ? `Answer first: ${p.unmet.join(', ')}` : p.error }
    if (!p.factCheck.ok && !ans[OVERRIDE_ID]) return { ok: false, error: `Blocked: this change adds facts that are not in your résumé or your answers (${p.factCheck.violations.join('; ')}). Confirm to apply anyway.` }
    const edit = applyOp(cv, f.apply, ans)
    if (!edit.ok) return { ok: false, error: edit.error }
    deps.writeCv(edit.after) // atomic, keeps cv.md.bak
    const undoId = deps.newId()
    deps.store.setUndo(pushUndo(deps.store.undo(), { undoId, findingId: f.id, before: cv, after: edit.after, at: deps.now() }))
    const next = await rescored(deps, a, edit.after, { id: f.id, to: 'applied' })
    return { ok: true, undoId, newCv: edit.after, rescore: next.report }
  } catch (e) { return { ok: false, error: (e as Error).message } }
})

export const undoApply = (deps: Deps, undoId: string): Promise<AtsApplyResult> => serial(async () => {
  try {
    const stack = deps.store.undo()
    const e = stack.find(x => x.undoId === undoId)
    const cv = deps.readCv()
    const a = deps.store.current()
    if (!e) return { ok: false, error: 'That change is no longer in the undo history.' }
    if (!cv || sha(cv) !== sha(e.after)) return { ok: false, error: 'Conflict: your résumé changed after this edit, so it was not undone automatically. Edit it by hand or undo your later changes first.' }
    deps.writeCv(e.before)
    deps.store.setUndo(stack.filter(x => x.undoId !== undoId))
    const rescore = a ? (await rescored(deps, a, e.before, { id: e.findingId, to: 'open' })).report : undefined
    return { ok: true, newCv: e.before, rescore }
  } catch (err) { return { ok: false, error: (err as Error).message } }
})

/** Changes that can still be undone, newest first. */
export function history(deps: Deps): AtsHistoryItem[] {
  const titles = new Map((deps.store.current()?.report.findings ?? []).map(f => [f.id, f.title]))
  return deps.store.undo().map(e => ({ undoId: e.undoId, findingId: e.findingId, title: titles.get(e.findingId) ?? 'Earlier change', at: e.at })).reverse()
}

export function dismissFinding(deps: Deps, findingId: string): boolean {
  const a = deps.store.current()
  if (!a?.report.findings.some(f => f.id === findingId)) return false
  deps.store.save({ ...a, report: { ...a.report, findings: a.report.findings.map(f => (f.id === findingId ? { ...f, status: 'dismissed' as const } : f)) } })
  return true
}
