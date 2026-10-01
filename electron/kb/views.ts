// What the renderer sees of a job's question base (plan §4): pure functions over store data, no electron.
import type { KbData } from './store'
import { needFor } from './research/generate'
import type { KbCoverage, KbFilter, KbItem, KbItemDetail, KbItemView, KbStatus, KbSummary, ResearchProgress } from './types'

const visible = (items: KbItem[]): KbItem[] => items.filter(i => !i.user.hidden)

/** "Why this one for you", computed at read time from the item's hooks and the skill graph; never raw CV text. */
export function whyForYou(item: KbItem, data: Pick<KbData, 'skills'>): string | null {
  const parts: string[] = []
  if (item.hooks.gap) parts.push(`A gap worth closing: ${item.hooks.gap}.`)
  else {
    const weak = data.skills.filter(s => item.skills.includes(s.id) && !s.inCv && s.expected !== 'aware').map(s => s.name)
    if (weak.length) parts.push(`The posting expects ${weak.slice(0, 3).join(', ')}; your résumé does not show ${weak.length > 1 ? 'them' : 'it'} yet.`)
  }
  if (item.hooks.cvFacts.length) parts.push(`Your résumé has: ${item.hooks.cvFacts.slice(0, 2).join('; ')}.`)
  return parts.length ? parts.join(' ') : null
}

export const itemView = (item: KbItem, data: Pick<KbData, 'skills'>): KbItemView => {
  const { hooks: _h, sources, ...rest } = item
  return { ...rest, sourceCount: sources.length, whyForYou: whyForYou(item, data) }
}

export function itemDetail(item: KbItem, data: KbData): KbItemDetail {
  const bySource = new Map(data.sources.map(s => [s.id, s]))
  return {
    ...itemView(item, data), hooks: item.hooks,
    sources: item.sources.flatMap(s => { const source = bySource.get(s.sourceId); return source ? [{ source, note: s.note }] : [] }),
  }
}

/** Hidden items are listed only on request (`hidden: true`), together with the visible ones. */
export function listItems(data: KbData, f: KbFilter = {}): KbItemView[] {
  const kinds = new Map(data.sources.map(s => [s.id, s.kind]))
  const q = f.text?.trim().toLowerCase()
  return (f.hidden ? data.items : visible(data.items))
    .filter(i => (!f.types?.length || f.types.includes(i.type))
      && (!f.skills?.length || f.skills.some(s => i.skills.includes(s)))
      && (!f.difficulty || (i.difficulty >= f.difficulty[0] && i.difficulty <= f.difficulty[1]))
      && (!f.provenance?.length || f.provenance.includes(i.provenance))
      && (!f.sourceKinds?.length || i.sources.some(s => { const k = kinds.get(s.sourceId); return k !== undefined && f.sourceKinds!.includes(k) }))
      && (!q || i.text.toLowerCase().includes(q)))
    .map(i => itemView(i, data))
}

export const coverageOf = (data: KbData): KbCoverage[] => {
  const shown = visible(data.items)
  return data.skills.map(s => ({ skillId: s.id, name: s.name, have: shown.filter(i => i.skills.includes(s.id)).length, need: needFor(s), expected: s.expected, inCv: s.inCv }))
}

export type SummaryEnv = { runId: string | null; progress: ResearchProgress | null; inputHash: string | null; now: number; refreshAfterDays: number }
export function summarise(jobId: string, data: KbData, env: SummaryEnv): KbSummary {
  const m = data.manifest
  const shown = visible(data.items)
  const inputChanged = !!m && env.inputHash !== null && m.inputHash !== env.inputHash
  const old = !!m && env.now - m.researchedAt > env.refreshAfterDays * 86_400_000
  const status: KbStatus = env.runId ? 'running' : !m ? (shown.length ? 'complete' : 'none') : m.status === 'complete' && (inputChanged || old) ? 'stale' : m.status
  return {
    jobId, status, researchedAt: m?.researchedAt ?? null, items: shown.length,
    sourcedPct: shown.length ? Math.round((shown.filter(i => i.provenance === 'sourced').length / shown.length) * 100) : 0,
    sources: data.sources.length, costUsd: m?.costUsd ?? 0, inputChanged, runId: env.runId, coverage: coverageOf(data), progress: env.progress,
  }
}
